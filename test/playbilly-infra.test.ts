import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
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
