# Emote Replacer

Swaps the emotes in a 7TV emote set for their seasonal variants, and grows the
list of known normal → seasonal swaps by comparing channels' existing sets.

## Emotes and sets

**Channel**:
A Twitch channel whose 7TV account owns one or more emote sets.
_Avoid_: User, streamer, account (when meaning the set owner)

**Emote Set**:
A named 7TV collection of emotes belonging to one channel.
_Avoid_: Set list, emote list

**Alias**:
The name an emote is typed as inside a particular emote set, which may differ from the emote's own name.
_Avoid_: Emote name (when meaning the in-set name)

**Season**:
An occasion with its own emote variants, e.g. Halloween or Winter.
_Avoid_: Holiday, event

**Winter**:
The season covering Christmas, xmas and general holiday variants.
_Avoid_: Christmas (as a separate season)

## Mappings

**Mapping**:
One accepted pairing of an original emote to its seasonal replacement within a preset.
_Avoid_: Combination, swap, pair (when meaning an accepted one)

**Preset**:
The curated collection of mappings for one season, used to replace emotes in a set.
_Avoid_: Dataset, mapping list

## Changing sets

**Run**:
One execution of replace in place, duplicate + replace, or revert against a target emote set, made of individual emote swaps.
_Avoid_: Job, batch, operation

**Revert**:
A run that applies a preset backwards, seasonal → normal; it can differ from what the set held before.
_Avoid_: Undo, restore

**Undo**:
Reversing exactly the swaps one earlier run made, restoring the set as it was before that run.
_Avoid_: Revert, rollback

## Discovering mappings

**Comparison**:
One specific normal emote set and one specific seasonal emote set, matched by alias. It belongs to the channel that owns the normal set, even when the seasonal set is owned by someone else; a channel can have several comparisons for the same season.
_Avoid_: Analysis, set pair, diff

**Sighting**:
One channel's evidence, from a comparison, that an original emote was swapped for a specific seasonal emote under the same alias.
_Avoid_: Match, observation, hit

**Candidate**:
An original → seasonal pairing that has sightings from enough distinct channels to be reviewed.
_Avoid_: Suggestion, proposal, review item

**Review**:
The admin's decision to accept a candidate into its season's preset or reject it.
_Avoid_: Approval, moderation

**Rejection**:
A permanent record that a pairing is wrong for its season; a rejected pairing never becomes a candidate again.
_Avoid_: Denial, dismissal
