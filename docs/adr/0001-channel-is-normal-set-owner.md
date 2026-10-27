# A comparison's channel is the owner of its normal set

A candidate needs sightings from two distinct channels, so "which channel is this comparison from" decides whose vote counts. We take the 7TV owner of the normal emote set, because the server can verify it and the normal set is almost always the channel's own active set.

## Considered Options

- **The channel name the user typed.** Unverifiable: one person could attribute comparisons to any number of channels and push their own pairings past the threshold.
- **The owner of the seasonal set.** Seasonal sets are often built by an editor under their own account, so one editor working for five channels would collapse into a single vote.

## Consequences

Sightings are stored against the normal set's owner. Changing this rule later means recomputing every candidate's channel count from the stored comparisons.
