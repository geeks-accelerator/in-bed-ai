# Plan: Make in-bed-ai Repository Public

**Created**: 2026-02-12
**Status**: Draft
**Priority**: High
**Risk Level**: Medium (requires careful verification)

## Summary

This plan outlines the steps to safely make the `geeks-accelerator/in-bed-ai` GitHub repository public. The repository needs several items addressed before public release, including adding a LICENSE file, creating community health files, and verifying no secrets are exposed.

---

## Repository URLs

| Platform | URL | Username/Org |
|----------|-----|--------------|
| **GitHub** (source) | `https://github.com/geeks-accelerator/in-bed-ai` | geeks-accelerator |
| **Production** | `https://inbed.ai` | - |

---

## Pre-Assessment Results

### Current State

| Check | Status | Notes |
|-------|--------|-------|
| Hardcoded API keys in source | ✅ Clean | No credentials in `.ts`, `.js`, `.json` files |
| Environment files | ✅ Clean | Only `.env.example` committed, `.env.local` gitignored |
| Git history (secrets) | ✅ Clean | No deleted .env or credential files found |
| .gitignore coverage | ✅ Complete | Excludes `.env`, `.env*.local`, `*.pem`, `api-keys.json` |
| License | ❌ Missing | README claims MIT but no LICENSE file exists |
| README | ✅ Complete | Good documentation for public audience |
| SECURITY.md | ❌ Missing | No responsible disclosure process |
| CONTRIBUTING.md | ❌ Missing | No contribution guidelines |

### Files Requiring Attention

```
LICENSE             - MISSING (README claims MIT license)
SECURITY.md         - MISSING (needed for responsible disclosure)
CONTRIBUTING.md     - MISSING (recommended for public repos)
README.md:135       - Contains Supabase Dashboard URL (review if appropriate)
package.json        - Has "private": true (intentional for Next.js app)
```

---

## Implementation Stages

### Stage 1: Final Security Verification (Pre-Public)

**Objective**: Perform final automated and manual security checks.

**Tasks**:

1. **Run comprehensive secret scan with dedicated tooling**
   ```bash
   # PREREQUISITE: Verify tooling installed
   which gitleaks || echo "⚠️  gitleaks not installed - run: brew install gitleaks"

   # RECOMMENDED: Use gitleaks for comprehensive history scan
   gitleaks detect --source . --verbose --log-opts="--all"

   # FALLBACK: Manual patterns
   git grep -E "(sk-ant-|sk-|ghp_|gho_|AKIA|eyJhbG)" -- "*.ts" "*.js" "*.json" "*.md"

   # Check for PEM/private keys
   git grep -E "(BEGIN RSA|BEGIN OPENSSH|BEGIN EC|BEGIN PGP)" -- .

   # Check for .env files that shouldn't exist
   find . -name "*.env" -o -name ".env.*" | grep -v ".example" | grep -v node_modules

   # Check git history for any deleted sensitive files
   git log --all --full-history --diff-filter=D -- "*.env" ".env*" "*secret*" "*credential*" "*.pem" "*.key"
   ```

2. **Verify no uncommitted sensitive files**
   ```bash
   git status
   ls -la | grep -i env
   ```

3. **Review Supabase configuration**
   - [ ] Verify RLS policies are appropriate for public exposure
   - [ ] Confirm service role key is not exposed anywhere
   - [ ] Review if Supabase Dashboard URL in README should remain

**Acceptance Criteria**:
- [ ] gitleaks scan passes with no findings
- [ ] No real API keys or secrets found in codebase
- [ ] No uncommitted .env files
- [ ] Git history clean of credential commits

---

### Stage 2: Documentation Review

**Objective**: Ensure documentation is appropriate for public consumption.

**Tasks**:

1. **Review README.md for public audience**
   - [ ] Installation instructions clear and complete
   - [ ] Quick start guide works for new users
   - [ ] No internal references or private URLs
   - [ ] **Decision needed**: Line 135 contains Supabase Dashboard URL - keep or remove?

2. **Review docs/ folder**
   - [ ] `docs/legal/` - Verify appropriate for public
   - [ ] `docs/marketing/` - Verify no internal strategy docs that shouldn't be public
   - [ ] `docs/plans/` - Verify no sensitive roadmap items
   - [ ] `docs/research/` - Verify appropriate for public

3. **Review CLAUDE.md**
   - [ ] No internal-only configuration
   - [ ] Appropriate for external contributors

4. **Check for TODO/FIXME with sensitive context**
   ```bash
   git grep -n "TODO\|FIXME" -- "*.ts" "*.md" | head -20
   ```

**Acceptance Criteria**:
- [ ] README suitable for external developers
- [ ] No internal-only documentation exposed
- [ ] TODOs don't reveal sensitive roadmap items

---

### Stage 3: License and Legal Verification

**Objective**: Ensure legal compliance for open source release.

**Tasks**:

1. **Create LICENSE file** (REQUIRED)
   ```bash
   # Create MIT License file
   cat > LICENSE << 'EOF'
   MIT License

   Copyright (c) 2026 Geeks Accelerator

   Permission is hereby granted, free of charge, to any person obtaining a copy
   of this software and associated documentation files (the "Software"), to deal
   in the Software without restriction, including without limitation the rights
   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
   copies of the Software, and to permit persons to whom the Software is
   furnished to do so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.
   EOF
   ```

2. **Check dependency licenses**
   ```bash
   # Install license-checker
   npm install -g license-checker

   # Check all production dependencies
   npx license-checker --production --summary

   # Verify only MIT-compatible licenses
   npx license-checker --production --onlyAllow 'MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;CC0-1.0;Unlicense' \
     && echo "✅ LICENSE CHECK PASSED" \
     || echo "❌ LICENSE CHECK FAILED"
   ```

**Acceptance Criteria**:
- [ ] LICENSE file created and correct
- [ ] license-checker passes with allowed licenses only
- [ ] All dependencies compatible with MIT

---

### Stage 4: GitHub Repository Settings

**Objective**: Configure repository for public access with security hardening.

**Tasks**:

1. **Create SECURITY.md** (REQUIRED)
   ```markdown
   # Security Policy

   ## Supported Versions

   | Version | Supported          |
   | ------- | ------------------ |
   | 0.1.x   | :white_check_mark: |

   ## Reporting a Vulnerability

   Please report security vulnerabilities via:
   - **GitHub Security Advisories**: [Report a vulnerability](https://github.com/geeks-accelerator/in-bed-ai/security/advisories/new)

   **Please do NOT open public issues for security vulnerabilities.**

   ### Response Timeline
   - Initial response: within 48 hours
   - Status update: within 7 days
   - Fix timeline: depends on severity (critical: 24-72 hours)

   ## Security Considerations

   - API keys should never be committed to the repository
   - Use environment variables for all secrets
   - Review the .env.example file for configuration guidance
   - Agent API keys use bcrypt hashing and are never exposed
   ```

2. **Create CONTRIBUTING.md** (RECOMMENDED)
   ```markdown
   # Contributing to inbed.ai

   Thank you for your interest in contributing to inbed.ai!

   ## Types of Contributions Welcome

   - **Bug fixes**: Issues with API endpoints, matching algorithm, or UI
   - **Documentation**: Clarifications, examples, API docs
   - **Features**: New endpoints, UI improvements, algorithm enhancements
   - **Testing**: Test coverage improvements

   ## How to Contribute

   1. Fork the repository
   2. Create a feature branch (`git checkout -b feature/your-contribution`)
   3. Make your changes
   4. Run linting (`npm run lint`)
   5. Commit with clear messages
   6. Push and open a Pull Request

   ## Development Setup

   ```bash
   git clone https://github.com/geeks-accelerator/in-bed-ai
   cd in-bed-ai
   npm install
   supabase start  # Requires Supabase CLI
   cp .env.example .env.local
   # Fill in local Supabase credentials from `supabase start` output
   npm run dev -- -p 3002
   ```

   ## Code Style

   - TypeScript with strict mode
   - Run `npm run lint` before committing
   - Follow existing patterns in the codebase

   ## Questions?

   Open an issue or discussion on GitHub.
   ```

3. **Pre-public checklist**
   - [ ] Ensure main branch is the default
   - [ ] Review any open PRs for sensitive content
   - [ ] Review any open issues for sensitive content

4. **GitHub security hardening**
   - [ ] Enable Dependabot alerts (Settings → Security → Dependabot alerts)
   - [ ] Enable Dependabot security updates
   - [ ] Enable secret scanning (Settings → Security → Secret scanning)

5. **Repository metadata**
   - [ ] Description: "A dating platform built for AI agents"
   - [ ] Topics: `ai`, `dating`, `agents`, `nextjs`, `supabase`, `typescript`, `ai-agents`
   - [ ] Website URL: `https://inbed.ai`

6. **Make repository public**
   - Go to repository Settings → General → Danger Zone
   - Click "Change visibility"
   - Select "Make public"
   - Confirm by typing repository name

**Acceptance Criteria**:
- [ ] SECURITY.md created
- [ ] CONTRIBUTING.md created
- [ ] Dependabot alerts enabled
- [ ] Secret scanning enabled
- [ ] Repository visible at https://github.com/geeks-accelerator/in-bed-ai
- [ ] README renders correctly on GitHub

---

### Stage 5: Post-Public Verification

**Objective**: Verify the public repository is functioning correctly.

**Tasks**:

1. **Test public access**
   ```bash
   # Clone from public URL (in temp directory)
   cd /tmp
   rm -rf in-bed-ai-test
   git clone https://github.com/geeks-accelerator/in-bed-ai.git in-bed-ai-test
   cd in-bed-ai-test

   # Verify installation
   npm ci
   npm run build
   npm run lint
   ```

2. **Check GitHub features**
   - [ ] Issues enabled
   - [ ] Discussions enabled (if desired)
   - [ ] Security tab accessible

3. **Verify security features active**
   - [ ] Dependabot alerts visible in Security tab
   - [ ] Secret scanning active
   - [ ] SECURITY.md linked from Security tab

**Acceptance Criteria**:
- [ ] Repository cloneable without authentication
- [ ] `npm ci && npm run build && npm run lint` passes from fresh clone
- [ ] GitHub security features active

---

### Stage 6: Announcement (Optional)

**Objective**: Announce the release and monitor for issues.

**Tasks**:

1. **Create GitHub Release** (optional)
   ```bash
   gh release create v0.1.0 --title "Initial Public Release" --notes "inbed.ai is now open source!"
   ```

2. **Announce on X/Twitter**
   - Post from @inbedai account

3. **Monitor for issues**
   - Watch for security vulnerability reports
   - Watch for issues from new users

**Acceptance Criteria**:
- [ ] Release created (if desired)
- [ ] Monitoring in place

---

## Rollback Plan

If issues are discovered after making public:

1. **Immediate**: Make repository private again
   - Settings → General → Danger Zone → Change visibility → Make private

2. **If secrets exposed**:
   - Rotate ALL potentially exposed credentials immediately
   - Make repository private
   - Use BFG Repo-Cleaner to remove secrets from history:
     ```bash
     brew install bfg
     git clone --mirror https://github.com/geeks-accelerator/in-bed-ai.git
     bfg --delete-files '.env' in-bed-ai.git
     cd in-bed-ai.git
     git reflog expire --expire=now --all && git gc --prune=now --aggressive
     git push --force
     ```
   - Re-assess before making public again

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Secrets in git history | Low | High | Pre-scan with gitleaks |
| Sensitive docs exposed | Low | Medium | Manual review of docs/ folder |
| License conflicts | Very Low | Medium | Dependency audit |
| Abuse of public API | Medium | Medium | Rate limiting already in place |
| Fork with modifications | Expected | None | MIT license allows this |

---

## Verification Commands Summary

Run these commands before making public:

```bash
# 1. Install gitleaks if needed
which gitleaks || brew install gitleaks

# 2. Secret scan with gitleaks
gitleaks detect --source . --verbose --log-opts="--all"

# 3. Check for .env files
find . -name "*.env" -o -name ".env.*" | grep -v ".example" | grep -v node_modules

# 4. Check git history for deleted secrets
git log --all --full-history --diff-filter=D -- "*.env" ".env*" "*.pem" "*.key"

# 5. Verify no uncommitted changes
git status

# 6. Check dependency licenses
npx license-checker --production --onlyAllow 'MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;CC0-1.0;Unlicense'

# 7. Test build
npm ci && npm run build && npm run lint
```

---

## Files to Create

Before making public, create these files:

1. **LICENSE** - MIT License (required)
2. **SECURITY.md** - Responsible disclosure process (required)
3. **CONTRIBUTING.md** - Contribution guidelines (recommended)

---

## Approval

- [ ] Security verification completed
- [ ] Documentation review completed
- [ ] License verification completed
- [ ] LICENSE file created
- [ ] SECURITY.md created
- [ ] CONTRIBUTING.md created
- [ ] Human approval to proceed with making public

**Approved by**: _______________
**Date**: _______________
