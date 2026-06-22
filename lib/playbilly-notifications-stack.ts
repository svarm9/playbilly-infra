import * as cdk from "aws-cdk-lib";
import * as sns from "aws-cdk-lib/aws-sns";
import * as ses from "aws-cdk-lib/aws-ses";
import { Construct } from "constructs";

export interface PlaybillyNotificationsStackProps extends cdk.StackProps {
  stage: "dev" | "prod";
}

export class PlaybillyNotificationsStack extends cdk.Stack {
  public readonly matchReadyTopic: sns.Topic;
  public readonly waitlistTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: PlaybillyNotificationsStackProps) {
    super(scope, id, props);
    const { stage } = props;

    this.matchReadyTopic = new sns.Topic(this, "MatchReadyTopic", {
      topicName: `playbilly-match-ready-${stage}`,
      displayName: "Playbilly match ready notifications",
    });

    this.waitlistTopic = new sns.Topic(this, "WaitlistTopic", {
      topicName: `playbilly-waitlist-${stage}`,
      displayName: "Playbilly waitlist promotion notifications",
    });

    if (stage === "prod") {
      new ses.EmailIdentity(this, "PlaybillyEmailIdentity", {
        identity: ses.Identity.domain("playbilly.app"),
      });
    }

    new cdk.CfnOutput(this, "MatchReadyTopicArn", { value: this.matchReadyTopic.topicArn, exportName: `playbilly-${stage}-match-ready-topic-arn` });
    new cdk.CfnOutput(this, "WaitlistTopicArn", { value: this.waitlistTopic.topicArn, exportName: `playbilly-${stage}-waitlist-topic-arn` });
  }
}
