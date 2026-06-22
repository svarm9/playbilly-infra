# playbilly-infra

AWS CDK (TypeScript) infrastructure for PlayBilly. Three stacks, deployed per stage (`dev` / `prod`).

## Stacks

| Stack | What it creates |
|---|---|
| `Playbilly-Storage-{stage}` | S3 assets bucket (player avatars, logos) + DUPR exports bucket (private, 30-day expiry) |
| `Playbilly-Notifications-{stage}` | SNS topics for match-ready + waitlist SMS; SES domain identity (prod only) |
| `Playbilly-Api-{stage}` | Lambda (Python 3.12, ARM64) + HTTP API Gateway running FastAPI via Mangum |

## Prerequisites

1. AWS CLI v2 configured with credentials
2. CDK bootstrapped: `npx cdk bootstrap aws://ACCOUNT_ID/us-east-1`
3. SSM parameters populated (see below)

## One-time SSM setup

```bash
aws ssm put-parameter --name "/playbilly/dev/supabase-url" --type String --value "https://your-project.supabase.co"
aws ssm put-parameter --name "/playbilly/dev/supabase-service-key" --type SecureString --value "your-service-role-key"
aws ssm put-parameter --name "/playbilly/dev/ses-dev-sender" --type String --value "you@youremail.com"
```

## Commands

```bash
yarn install         # install dependencies
yarn test            # run CDK unit tests
yarn diff:dev        # preview dev changes
yarn deploy:dev      # deploy dev stage
yarn destroy:dev     # tear down dev stage
yarn deploy:prod     # deploy prod (requires approval for broadening changes)
```

## Notes

- The `backend/` directory must exist at `../backend` relative to this folder — it's bundled into the Lambda during `cdk deploy`
- Supabase is intentionally outside CDK (provisioned via the Supabase dashboard, credentials stored in SSM)
- SES starts in sandbox mode — request production access early (24–48hr approval)
- SNS SMS spend limit may need a manual increase for new AWS accounts
