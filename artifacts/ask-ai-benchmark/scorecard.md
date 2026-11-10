# Ask AI routing benchmark scorecard

- Generated: 2026-11-10T12:40:49.980Z
- Pass rate: **100%** (25/25)

## By category

| Category | Pass | Total |
| --- | --- | --- |
| direct-inventory | 2 | 2 |
| acknowledgement | 6 | 6 |
| smalltalk | 4 | 4 |
| count-confirmation | 4 | 4 |
| coreference | 4 | 4 |
| quantity-vs-ordinal | 2 | 2 |
| affirmation | 1 | 1 |
| scope-isolation | 2 | 2 |

## Cases

| ✓ | Scenario | Question | Expectation | Route | Model? | Answer |
| --- | --- | --- | --- | --- | --- | --- |
| ✅ | list-recordings | list my recordings | Lists all 4 recordings directly, no model | direct:direct-list | no | Here are your recordings: 1. AD83 Fixture - Roadmap Review — Jun 1, 10:00 AM (Ju |
| ✅ | count-recordings | how many recordings do I have? | Answers "You have 4 recordings." directly, no model | direct:direct-count | no | You have 4 recordings. |
| ✅ | ack-thanks | thanks! | Acknowledged with no retrieval/model | conversational-acknowledgement | no | You're welcome. |
| ✅ | ack-ok-cool | ok cool | Acknowledged with no retrieval/model | conversational-acknowledgement | no | You're welcome. |
| ✅ | ack-cheers-GAP | cheers | GAP: "cheers" should be treated as an acknowledgement | conversational-acknowledgement | no | You're welcome. |
| ✅ | ack-ty-no-worries-GAP | no worries, ty | GAP: casual "no worries, ty" should be an acknowledgement | conversational-acknowledgement | no | You're welcome. |
| ✅ | ack-much-appreciated-GAP | much appreciated | GAP: "much appreciated" should be an acknowledgement | conversational-acknowledgement | no | You're welcome. |
| ✅ | ack-not-mixed-request | thanks, can you show action items? | Mixed thanks+request must NOT be swallowed; surfaces action items (Support) | scoped:focused | no | Summary of AD83 Fixture - Roadmap Review — Jun 1, 10:00 AM: - Fixture note: Road |
| ✅ | greeting-hey | hey | Greeting answered instantly with no retrieval/model | smalltalk | no | Hi! Ask me anything about your meetings — what was discussed, your action items  |
| ✅ | greeting-good-morning | good morning! | Greeting answered instantly with no retrieval/model | smalltalk | no | Hi! Ask me anything about your meetings — what was discussed, your action items  |
| ✅ | capability-question | what can you do? | Capability question answered instantly with no retrieval/model | smalltalk | no | I'm AutoDoc's meeting assistant. Ask me what was discussed in a meeting, who own |
| ✅ | greeting-with-request-not-smalltalk | hey, what did we discuss in the design sync? | A greeting glued to a real request routes to retrieval, not small talk | plan:fast | no | Summary of AD83 Fixture - Design Sync — Jun 1, 8:00 AM: - Fixture note: The team |
| ✅ | count-confirm-four | so four then? | Confirms 4 recordings from session state, no model | count-confirmation | no | Yes, you have 4 local recordings in that list. |
| ✅ | count-confirm-five-wrong | so five total? | Corrects to 4 recordings from session state, no model | count-confirmation | no | Not quite - you have 4 local recordings in that list. |
| ✅ | count-confirm-is-that-all-GAP | is that all of them? | GAP: "is that all" should confirm the count from session state | count-confirmation | no | Yes, you have 4 local recordings in that list. |
| ✅ | count-confirm-only-four-GAP | only 4? | GAP: "only 4?" should confirm the count from session state | count-confirmation | no | Yes, you have 4 local recordings in that list. |
| ✅ | ordinal-second | show notes for the second one | Resolves to 2nd listed recording (Support Triage) | scoped:focused | no | Summary of AD83 Fixture - Support Triage — Jun 1, 9:00 AM: - Fixture note: Casey |
| ✅ | ordinal-third | summarize the third one | Resolves to 3rd listed recording (Design Sync) | scoped:focused | no | Summary of AD83 Fixture - Design Sync — Jun 1, 8:00 AM: - Fixture note: The team |
| ✅ | ordinal-last-GAP | show notes for the last one | GAP: "the last one" should resolve to the 4th listed recording (Calendar Auth) | scoped:focused | no | Summary of AD83 Fixture - Calendar Auth Review — Jun 1, 7:00 AM: - Fixture note: |
| ✅ | title-ref-GAP | tell me about the calendar auth one | GAP: title-style reference should resolve to Calendar Auth Review | scoped:focused | yes | MODEL_ANSWER scope=[roadmap, support, design, calendar auth, consent-screen] |
| ✅ | quantity-top-3-from-support-GAP | what are the top 3 action items from the support meeting? | GAP: "3" is a quantity, not an ordinal; must scope to Support, not the 3rd recording | scoped:focused | yes | MODEL_ANSWER scope=[roadmap, support, escalation, design, calendar auth] |
| ✅ | quantity-2-takeaways-roadmap-GAP | give me 2 takeaways from the roadmap review | GAP: "2" is a quantity, not an ordinal; must scope to Roadmap, not the 2nd recording | plan:fast | yes | MODEL_ANSWER scope=[roadmap, support, design, calendar auth] |
| ✅ | yes-after-clarification-GAP | yes the first one | GAP: an affirmation answering a clarification must NOT return "You're welcome." | calendar-fallback | yes | MODEL_ANSWER scope=[roadmap, design] |
| ✅ | new-search-not-pinned | summarize the design sync | Scopes to Design Sync | plan:fast | no | Summary of AD83 Fixture - Design Sync — Jun 1, 8:00 AM: - Fixture note: The team |
| ✅ | new-search-not-pinned | who owns the escalation follow-up? | New question must retrieve Support Triage, not stay pinned to Design Sync | plan:fast | no | I found 1 action item in 1 matching meeting. From AD83 Fixture - Support Triage  |
