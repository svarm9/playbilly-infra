import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
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

    const supabaseUrl = ssm.StringParameter.valueForStringParameter(this, `/playbilly/${stage}/supabase-url`);
    const supabaseAnonKey = ssm.StringParameter.valueForStringParameter(this, `/playbilly/${stage}/supabase-anon-key`);
    const supabaseServiceKey = ssm.StringParameter.valueForStringParameter(this, `/playbilly/${stage}/supabase-service-key`);

    const apiFunction = new lambda.Function(this, "ApiFunction", {
      functionName: `playbilly-api-${stage}`,
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      handler: "main.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../playbilly-backend"), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          // requirements.txt is generated from pyproject.toml via: uv export --no-hashes --no-dev -o requirements.txt
          command: ["bash", "-c", "pip install --no-cache-dir -r requirements.txt -t /asset-output && cp -r app main.py /asset-output/"],
        },
      }),
      memorySize: stage === "prod" ? 512 : 256,
      timeout: cdk.Duration.seconds(29),
      environment: {
        STAGE: stage,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: supabaseAnonKey,
        SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey,
        ASSETS_BUCKET_NAME: assetsBucket.bucketName,
        MATCH_READY_TOPIC_ARN: matchReadyTopic.topicArn,
        WAITLIST_TOPIC_ARN: waitlistTopic.topicArn,
        SES_FROM_ADDRESS: stage === "prod"
          ? "notifications@playbilly.app"
          : ssm.StringParameter.valueForStringParameter(this, `/playbilly/${stage}/ses-dev-sender`),
      },
      logGroup: new logs.LogGroup(this, "ApiLogGroup", {
        retention: stage === "prod" ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.TWO_WEEKS,
      }),
    });

    matchReadyTopic.grantPublish(apiFunction);
    waitlistTopic.grantPublish(apiFunction);
    assetsBucket.grantReadWrite(apiFunction);

    apiFunction.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    }));

    const httpApi = new apigw.HttpApi(this, "HttpApi", {
      apiName: `playbilly-api-${stage}`,
      corsPreflight: {
        allowOrigins: stage === "prod" ? ["https://playbilly.app", "https://playbilly.vercel.app"] : ["*"],
        allowMethods: [apigw.CorsHttpMethod.GET, apigw.CorsHttpMethod.POST, apigw.CorsHttpMethod.PATCH, apigw.CorsHttpMethod.DELETE, apigw.CorsHttpMethod.OPTIONS],
        allowHeaders: ["Content-Type", "Authorization"],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const integration = new integrations.HttpLambdaIntegration("ApiIntegration", apiFunction);
    httpApi.addRoutes({ path: "/{proxy+}", methods: [apigw.HttpMethod.ANY], integration });
    httpApi.addRoutes({ path: "/", methods: [apigw.HttpMethod.ANY], integration });

    this.apiUrl = httpApi.apiEndpoint;

    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint, exportName: `playbilly-${stage}-api-url`, description: "Set this as VITE_API_URL in the frontend's env config" });
    new cdk.CfnOutput(this, "ApiFunctionName", { value: apiFunction.functionName, exportName: `playbilly-${stage}-api-function-name` });
  }
}
