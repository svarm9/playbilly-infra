import * as cdk from "aws-cdk-lib";
import { Capture, Match, Template } from "aws-cdk-lib/assertions";
import { PlaybillyApiStack } from "../lib/playbilly-api-stack";
import { PlaybillyStorageStack } from "../lib/playbilly-storage-stack";
import { PlaybillyNotificationsStack } from "../lib/playbilly-notifications-stack";

describe("PlaybillyStorageStack", () => {
  const app = new cdk.App();
  const stack = new PlaybillyStorageStack(app, "TestStorage", { stage: "dev" });
  const template = Template.fromStack(stack);

  test("creates assets bucket", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "playbilly-assets-dev",
    });
  });

  test("creates exports bucket", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "playbilly-dupr-exports-dev",
    });
  });

  test("exports bucket blocks all public access", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      BucketName: "playbilly-dupr-exports-dev",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test("assets bucket grants public read scoped to avatars/*", () => {
    const resource = new Capture();
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "s3:GetObject",
            Effect: "Allow",
            Principal: { AWS: "*" },
            Resource: resource,
          }),
        ]),
      }),
    });
    // Public read must not extend beyond the avatars/ prefix.
    expect(JSON.stringify(resource.asObject())).toContain("avatars/*");
  });
});

describe("PlaybillyApiStack", () => {
  // Disable Docker asset bundling so the test synthesizes without building the
  // Lambda package (a placeholder asset is used instead).
  const app = new cdk.App({ context: { "aws:cdk:bundling-stacks": [] } });
  const storage = new PlaybillyStorageStack(app, "TestStorageForApi", { stage: "dev" });
  const notifications = new PlaybillyNotificationsStack(app, "TestNotifsForApi", { stage: "dev" });
  const stack = new PlaybillyApiStack(app, "TestApi", {
    stage: "dev",
    assetsBucket: storage.assetsBucket,
    matchReadyTopic: notifications.matchReadyTopic,
    waitlistTopic: notifications.waitlistTopic,
  });
  const template = Template.fromStack(stack);

  test("Lambda env uses the backend-matching keys", () => {
    // Names must match playbilly-backend/app/core/config.py exactly.
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          // Resolves to the assets bucket name (cross-stack import) at deploy.
          ASSETS_BUCKET: Match.anyValue(),
          ASSETS_BASE_URL: Match.anyValue(),
          SES_SENDER: Match.anyValue(),
          MATCH_READY_TOPIC_ARN: Match.anyValue(),
        }),
      },
    });
  });

  test("Lambda env drops the old mismatched keys", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          ASSETS_BUCKET_NAME: Match.absent(),
          SES_FROM_ADDRESS: Match.absent(),
        }),
      },
    });
  });

  test("Lambda env does not declare AWS_REGION (Lambda sets it)", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          AWS_REGION: Match.absent(),
        }),
      },
    });
  });
});

describe("PlaybillyNotificationsStack", () => {
  const app = new cdk.App();
  const stack = new PlaybillyNotificationsStack(app, "TestNotifications", { stage: "dev" });
  const template = Template.fromStack(stack);

  test("creates match ready SNS topic", () => {
    template.hasResourceProperties("AWS::SNS::Topic", {
      TopicName: "playbilly-match-ready-dev",
    });
  });

  test("creates waitlist SNS topic", () => {
    template.hasResourceProperties("AWS::SNS::Topic", {
      TopicName: "playbilly-waitlist-dev",
    });
  });

  test("does not create SES identity for dev", () => {
    template.resourceCountIs("AWS::SES::EmailIdentity", 0);
  });
});
