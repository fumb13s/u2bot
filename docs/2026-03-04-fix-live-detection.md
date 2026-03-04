# Fix Live Stream Detection (Issue #1)

## Problem

YouTube now returns a `LOGIN_REQUIRED` stub in `ytInitialPlayerResponse` for
unauthenticated requests. The stub is ~3,942 chars and does not contain the
`isLiveContent` or `isLive` fields that `isLiveVideo()` relies on. As a result,
live streams are always classified as regular video uploads.

## Root Cause

The current logic (lines 29-31 of `src/rssPoller.js`) requires **both**:

```js
/"isLiveContent"\s*:\s*true/.test(section) &&
/"isLive"\s*:\s*true/.test(section)
```

With the login wall, neither field is present in `ytInitialPlayerResponse`, so
the function returns `false` for every video, including live streams.

## Solution

Add a fallback check for the `is_viewed_live` tracking parameter, which is
present in `ytInitialPlayerResponse` even inside the login-walled stub.

| Video type       | `is_viewed_live` value |
| ---------------- | ---------------------- |
| Live stream      | `"True"`               |
| Regular video    | `"False"`              |

The fallback only fires when the primary check (`isLiveContent` + `isLive`)
does not match. This preserves forward compatibility: if YouTube ever restores
the full player response for unauthenticated requests, the original check will
resume working without any code change.

## Implementation

### Step 1: Update `isLiveVideo()` in `src/rssPoller.js`

**File:** `src/rssPoller.js`, lines 29-31

**Current code:**

```js
return (
  /"isLiveContent"\s*:\s*true/.test(section) &&
  /"isLive"\s*:\s*true/.test(section)
);
```

**New code:**

```js
// Primary: original check (works when YouTube serves the full player response)
if (
  /"isLiveContent"\s*:\s*true/.test(section) &&
  /"isLive"\s*:\s*true/.test(section)
) {
  return true;
}

// Fallback: tracking params (works even with LOGIN_REQUIRED stub)
return /"is_viewed_live","value":"True"/.test(section);
```

**Why this is safe:**

- `is_viewed_live` lives inside the `ytInitialPlayerResponse` section, which
  the function already scopes to. There is no risk of matching a recommended
  video's tracking params because those live in `ytInitialData`.
- The primary check is tried first. The fallback only activates when the
  primary check fails (i.e., when the login wall is in effect or when the
  fields are simply absent).
- For a regular video behind the login wall, `is_viewed_live` is `"False"`,
  so the fallback correctly returns `false`.
- For a past-live VOD behind the login wall, `is_viewed_live` is `"False"`
  (the tracking param reflects the current state, not the historical state),
  so the fallback correctly returns `false`.

### Step 2: Add unit tests in `test/rssPoller.test.js`

Add the following test cases to the existing `describe('isLiveVideo', ...)` block:

#### Test 2a: Detect live stream via `is_viewed_live` fallback (LOGIN_REQUIRED stub)

Mock `fetch` to return HTML containing a `ytInitialPlayerResponse` section that:
- Has `"status":"LOGIN_REQUIRED"` (mimicking the login wall)
- Does NOT contain `isLiveContent` or `isLive`
- Contains `"is_viewed_live","value":"True"`

Assert: `isLiveVideo()` returns `true`.

**Mock HTML:**

```js
'<html><script>var ytInitialPlayerResponse = ' +
'{"playabilityStatus":{"status":"LOGIN_REQUIRED"},' +
'"trackingParams":[{"key":"is_viewed_live","value":"True"}]}' +
';</script></html>'
```

#### Test 2b: Regular video behind login wall returns `false`

Mock `fetch` to return HTML containing a `ytInitialPlayerResponse` section that:
- Has `"status":"LOGIN_REQUIRED"`
- Contains `"is_viewed_live","value":"False"`

Assert: `isLiveVideo()` returns `false`.

**Mock HTML:**

```js
'<html><script>var ytInitialPlayerResponse = ' +
'{"playabilityStatus":{"status":"LOGIN_REQUIRED"},' +
'"trackingParams":[{"key":"is_viewed_live","value":"False"}]}' +
';</script></html>'
```

#### Test 2c: Primary check still takes precedence when available

Mock `fetch` to return HTML containing a `ytInitialPlayerResponse` section that
has BOTH the original fields (`isLiveContent: true`, `isLive: true`) AND
`is_viewed_live`. This ensures the primary path is not broken by the new
fallback.

Assert: `isLiveVideo()` returns `true`.

**Mock HTML:**

```js
'<html><script>var ytInitialPlayerResponse = ' +
'{"videoDetails":{"isLive":true,"isLiveContent":true},' +
'"trackingParams":[{"key":"is_viewed_live","value":"True"}]}' +
';</script></html>'
```

#### Test 2d: `is_viewed_live` absent entirely returns `false`

Mock `fetch` to return a `ytInitialPlayerResponse` section that contains
neither the original fields nor `is_viewed_live`.

Assert: `isLiveVideo()` returns `false`.

**Mock HTML:**

```js
'<html><script>var ytInitialPlayerResponse = ' +
'{"playabilityStatus":{"status":"LOGIN_REQUIRED"}}' +
';</script></html>'
```

### Step 3: Update integration test expectations

**File:** `test/integration/rssPoller.integration.test.js`

The existing integration test `'returns true for a known live stream'` (line 128)
uses video ID `jfKfPfyJRdk` (Lofi Girl 24/7 stream). This test is currently
failing in production due to the bug being fixed. After the code change, it
should pass again. No changes needed to the test itself, but verify it passes.

### Step 4: Update existing `pollRssFeedForWatcher` test for login-walled live detection

**File:** `test/rssPoller.test.js`

The test `'sends live notification when deferred video is detected as live'`
(line 346) currently uses the old-style mock HTML with `isLive` and
`isLiveContent`. Add a **second variant** of this test that uses the
login-walled fallback HTML (with `is_viewed_live`) to verify the full
end-to-end flow (RSS poll -> deferred check -> fallback live detection ->
live notification sent).

**Mock HTML for the `isLiveVideo` fetch in the new test:**

```js
'<html><script>var ytInitialPlayerResponse = ' +
'{"playabilityStatus":{"status":"LOGIN_REQUIRED"},' +
'"trackingParams":[{"key":"is_viewed_live","value":"True"}]}' +
';</script></html>'
```

### Step 5: Update CHANGELOG.md

Add a new section at the top of the changelog (this will be version 1.3.1 or
whatever version bump is chosen):

```markdown
## 1.3.1

### Fixed
- Live stream detection failing due to YouTube LOGIN_REQUIRED wall in
  `ytInitialPlayerResponse` -- added `is_viewed_live` tracking param fallback
```

### Step 6: Verify

1. Run unit tests: `npm test`
2. Run integration tests: `npm run test:integration`
   - Specifically verify the Lofi Girl live stream test passes
3. Manually verify (optional) by checking the bot log output for a known
   live stream video ID

## Files Changed

| File                                          | Change                                      |
| --------------------------------------------- | ------------------------------------------- |
| `src/rssPoller.js`                            | Add `is_viewed_live` fallback to `isLiveVideo()` |
| `test/rssPoller.test.js`                      | Add 4 unit tests + 1 integration-style test |
| `test/integration/rssPoller.integration.test.js` | No changes needed (existing test should now pass) |
| `CHANGELOG.md`                                | Add 1.3.1 entry                             |

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| YouTube removes `is_viewed_live` from tracking params | Low | Primary check is still in place; monitor integration tests |
| `is_viewed_live` semantics change (e.g., `"True"` for premieres) | Low | Premieres are treated as live by YouTube itself; this is acceptable behavior |
| The regex matches `is_viewed_live` in a different context within `ytInitialPlayerResponse` | Very low | The search is already scoped to the player response section, and `is_viewed_live` is a specific tracking param key unlikely to appear elsewhere |

## Out of Scope

- Switching to an authenticated YouTube API (would require an API key)
- Alternative detection methods (e.g., oEmbed, `/live` page scraping)
- Version bump in `package.json` (to be decided by maintainer)
