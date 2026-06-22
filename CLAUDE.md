# Playbilly — Infrastructure

AWS CDK (TypeScript) infrastructure for the Playbilly tournament management platform.

## Companion repos

- `playbilly` — React + TypeScript frontend (hosted on Vercel, not in CDK)
- `playbilly-backend` — FastAPI backend → deployed here as Lambda

## Stack

| Layer | Choice |
|---|---|
| IaC | AWS CDK (TypeScript) |
| Backend runtime | AWS Lambda (ARM64) + HTTP API Gateway |
| Notifications | AWS SNS (SMS) + SES (email) |
| Storage | AWS S3 (assets + DUPR CSV exports) |
| Secrets | AWS SSM Parameter Store |
| Region | us-east-1 |

## Stacks (dev / prod per stage)

### Storage stack
- `assetsBucket` — static assets
- `exportsBucket` — DUPR CSV exports (30-day lifecycle expiry)

### Notifications stack
- `matchReadyTopic` — SNS topic for match-ready SMS
- `waitlistTopic` — SNS topic for waitlist promotions
- SES domain identity for outbound email

### API stack
- Lambda function (ARM64, Mangum adapter for FastAPI)
- HTTP API Gateway
- Supabase credentials pulled from SSM Parameter Store at runtime

## SSM parameters required (one-time setup)

```
/playbilly/{stage}/supabase-url
/playbilly/{stage}/supabase-service-key
/playbilly/dev/ses-dev-sender    # dev only, until SES domain verified
```

## One-time AWS setup

```bash
# Bootstrap CDK (once per account/region)
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1

# Verify SES domain via DNS CNAME (prod)
# Request SES production access — allow 24–48hr approval
# Request SNS SMS spend limit increase (new accounts default low)
```

## Commands

```bash
yarn build          # compile TypeScript
yarn cdk diff       # preview changes
yarn cdk deploy     # deploy all stacks
yarn cdk deploy --context stage=prod   # deploy prod
yarn test           # CDK snapshot tests (Jest)
```

## Conventions

- Stage parameter (`dev` | `prod`) controls all resource naming and config
- No hardcoded account IDs — use CDK environment tokens
- Vercel handles frontend hosting — do not add CloudFront/S3 for the React app
