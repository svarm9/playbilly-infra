import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface PlaybillyStorageStackProps extends cdk.StackProps {
  stage: "dev" | "prod";
}

export class PlaybillyStorageStack extends cdk.Stack {
  public readonly assetsBucket: s3.Bucket;
  public readonly exportsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: PlaybillyStorageStackProps) {
    super(scope, id, props);
    const { stage } = props;
    const isProd = stage === "prod";

    this.assetsBucket = new s3.Bucket(this, "AssetsBucket", {
      bucketName: `playbilly-assets-${stage}`,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: true, blockPublicPolicy: false,
        ignorePublicAcls: true, restrictPublicBuckets: false,
      }),
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
        allowedOrigins: isProd ? ["https://playbilly.app"] : ["http://localhost:5173", "https://*.vercel.app"],
        allowedHeaders: ["*"], maxAge: 3000,
      }],
      lifecycleRules: [{ id: "abort-incomplete-uploads", abortIncompleteMultipartUploadAfter: cdk.Duration.days(1) }],
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    this.exportsBucket = new s3.Bucket(this, "ExportsBucket", {
      bucketName: `playbilly-dupr-exports-${stage}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{ id: "expire-exports-after-30-days", expiration: cdk.Duration.days(30) }],
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    new cdk.CfnOutput(this, "AssetsBucketName", { value: this.assetsBucket.bucketName, exportName: `playbilly-${stage}-assets-bucket` });
    new cdk.CfnOutput(this, "ExportsBucketName", { value: this.exportsBucket.bucketName, exportName: `playbilly-${stage}-exports-bucket` });
  }
}
