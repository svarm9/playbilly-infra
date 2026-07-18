import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sns from "aws-cdk-lib/aws-sns";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import * as path from "path";

export interface PlaybillyApiStackProps extends cdk.StackProps {
  stage: "dev" | "prod";
  assetsBucket: s3.Bucket;
  matchReadyTopic: sns.Topic;
  waitlistTopic: sns.Topic;
}

export class PlaybillyApiStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: PlaybillyApiStackProps) {
    super(scope, id, props);
    const { stage, assetsBucket, matchReadyTopic, waitlistTopic } = props;

    const supabaseUrl = ssm.StringParameter.valueForStringParameter(
      this,
      `/playbilly/${stage}/supabase-url`,
    );
    const supabaseAnonKey = ssm.StringParameter.valueForStringParameter(
      this,
      `/playbilly/${stage}/supabase-anon-key`,
    );
    const supabaseServiceKey = ssm.StringParameter.valueForStringParameter(
      this,
      `/playbilly/${stage}/supabase-service-key`,
    );
    const devBypassEnabled = ssm.StringParameter.valueForStringParameter(
      this,
      `/playbilly/${stage}/dev-bypass-enabled`,
    );

    // The backend is a sibling repo; point projectRoot + the deps lockfile at it
    // so NodejsFunction can bundle its Lambda entrypoint.
    const backendRoot = path.join(__dirname, "../../playbilly-backend");

    const apiFunction = new NodejsFunction(this, "ApiFunction", {
      functionName: `playbilly-api-${stage}`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      // Hono handler exported from the backend's Lambda entrypoint.
      entry: path.join(backendRoot, "src/lambda.ts"),
      handler: "handler",
      projectRoot: backendRoot,
      depsLockFilePath: path.join(backendRoot, "package-lock.json"),
      bundling: {
        format: OutputFormat.CJS,
        target: "node22",
        minify: true,
        sourceMap: true,
        // The AWS SDK v3 ships with the Node.js 20/22 Lambda runtime — keep it
        // external so it is not bundled. Everything else (Hono, Zod, jose,
        // @supabase/supabase-js, ws) is bundled into a single self-contained file.
        externalModules: ["@aws-sdk/*"],
      },
      memorySize: stage === "prod" ? 512 : 256,
      timeout: cdk.Duration.seconds(29),
      environment: {
        STAGE: stage,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: supabaseAnonKey,
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey,
        DEV_BYPASS_ENABLED: devBypassEnabled,
        // Env keys must match playbilly-backend/app/core/config.py exactly
        // (ASSETS_BUCKET, ASSETS_BASE_URL, SES_SENDER). AWS_REGION is set by
        // Lambda automatically, so it is intentionally not declared here.
        ASSETS_BUCKET: assetsBucket.bucketName,
        ASSETS_BASE_URL: `https://${assetsBucket.bucketName}.s3.${this.region}.amazonaws.com`,
        MATCH_READY_TOPIC_ARN: matchReadyTopic.topicArn,
        WAITLIST_TOPIC_ARN: waitlistTopic.topicArn,
        SES_SENDER:
          stage === "prod"
            ? "notifications@playbilly.app"
            : ssm.StringParameter.valueForStringParameter(
                this,
                `/playbilly/${stage}/ses-dev-sender`,
              ),
      },
      logGroup: new logs.LogGroup(this, "ApiLogGroup", {
        retention:
          stage === "prod"
            ? logs.RetentionDays.ONE_MONTH
            : logs.RetentionDays.TWO_WEEKS,
      }),
    });

    matchReadyTopic.grantPublish(apiFunction);
    waitlistTopic.grantPublish(apiFunction);
    assetsBucket.grantReadWrite(apiFunction);

    apiFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"],
      }),
    );

    const httpApi = new apigw.HttpApi(this, "HttpApi", {
      apiName: `playbilly-api-${stage}`,
      corsPreflight: {
        allowOrigins:
          stage === "prod"
            ? ["https://playbilly.app", "https://playbilly.vercel.app"]
            : ["*"],
        allowMethods: [
          apigw.CorsHttpMethod.GET,
          apigw.CorsHttpMethod.POST,
          apigw.CorsHttpMethod.PATCH,
          apigw.CorsHttpMethod.DELETE,
          apigw.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["Content-Type", "Authorization"],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const integration = new integrations.HttpLambdaIntegration(
      "ApiIntegration",
      apiFunction,
    );
    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigw.HttpMethod.ANY],
      integration,
    });
    httpApi.addRoutes({
      path: "/",
      methods: [apigw.HttpMethod.ANY],
      integration,
    });

    this.apiUrl = httpApi.apiEndpoint;

    new cdk.CfnOutput(this, "ApiUrl", {
      value: httpApi.apiEndpoint,
      exportName: `playbilly-${stage}-api-url`,
      description: "Set this as VITE_API_URL in the frontend's env config",
    });
    new cdk.CfnOutput(this, "ApiFunctionName", {
      value: apiFunction.functionName,
      exportName: `playbilly-${stage}-api-function-name`,
    });
  }
}
