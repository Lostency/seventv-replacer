/**
 * 7TV keeps most spellings as they are (ä, é, &, ., * all work), but refuses
 * some characters, such as commas. When it refuses a name, this is the
 * first suggestion offered to the user, who has the final say.
 */
export function suggestAlias(alias: string): string {
  const stripped = alias.replace(/[,\s]/g, '');
  if (!stripped) return 'emote';
  // Nothing obviously wrong with the name: it may clash with one already in the set.
  return stripped === alias ? `${alias}_` : stripped;
}
