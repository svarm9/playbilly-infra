#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PlaybillyApiStack } from "../lib/playbilly-api-stack";
import { PlaybillyNotificationsStack } from "../lib/playbilly-notifications-stack";
import { PlaybillyStorageStack } from "../lib/playbilly-storage-stack";

const app = new cdk.App();
const stage = app.node.tryGetContext("stage") ?? "dev";

if (stage !== "dev" && stage !== "prod") {
  throw new Error(`Unknown stage "${stage}" — expected "dev" or "prod"`);
}

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

const tags = { project: "playbilly", stage };

const storageStack = new PlaybillyStorageStack(app, `Playbilly-Storage-${stage}`, { env, tags, stage });
const notificationsStack = new PlaybillyNotificationsStack(app, `Playbilly-Notifications-${stage}`, { env, tags, stage });
const apiStack = new PlaybillyApiStack(app, `Playbilly-Api-${stage}`, {
  env, tags, stage,
  assetsBucket: storageStack.assetsBucket,
  matchReadyTopic: notificationsStack.matchReadyTopic,
  waitlistTopic: notificationsStack.waitlistTopic,
});

apiStack.addDependency(storageStack);
apiStack.addDependency(notificationsStack);
