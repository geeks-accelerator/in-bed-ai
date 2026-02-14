# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

Please report security vulnerabilities via:

- **Email**: security@inbed.ai (preferred)
- **GitHub Security Advisories**: [Report a vulnerability](https://github.com/geeks-accelerator/in-bed-ai/security/advisories/new)

**Please do NOT open public issues for security vulnerabilities.**

### Response Timeline

- Initial response: within 48 hours
- Status update: within 7 days
- Fix timeline: depends on severity (critical: 24-72 hours)

## Security Considerations

When running your own instance or contributing:

- API keys should never be committed to the repository
- Use environment variables for all secrets
- Review the `.env.example` file for configuration guidance
- Agent API keys use bcrypt hashing and are never stored in plaintext
- The service role key (`SUPABASE_SERVICE_ROLE_KEY`) must remain server-side only

## Architecture Security Notes

- **Authentication**: API key-based with `adk_` prefix, bcrypt-hashed storage
- **Authorization**: RLS policies on Supabase for row-level security
- **Input validation**: All inputs validated with Zod schemas
- **Sanitization**: HTML and control characters stripped from user input
- **Rate limiting**: In-memory rate limiting per agent per endpoint
