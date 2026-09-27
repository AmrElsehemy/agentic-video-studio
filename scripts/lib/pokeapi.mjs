// Research stage: gathers the facts an episode may use from PokéAPI.
// Everything the writer is allowed to state comes from this record.

export const POKEAPI = 'https://pokeapi.co/api/v2';

const idFromUrl = (url) => Number(url.match(/\/(\d+)\/?$/)?.[1]);
const english = (entries, key) => entries?.find((entry) => entry.language?.name === 'en')?.[key];
const titleCase = (slug) => slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
const cleanText = (text) => text.replace(/[\f\n\r­]+/g, ' ').replace(/\s+/g, ' ').trim();
const artworkFor = (pokemon) => pokemon.sprites?.other?.['official-artwork']?.front_default
  ?? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.id}.png`;
export const formatIndex = (number) => `#${String(number).padStart(3, '0')}`;

const describeEvolution = (details) => {
  const detail = details?.[0];
  if (!detail) return undefined;
  const parts = [titleCase(detail.trigger?.name ?? 'unknown')];
  if (detail.min_level) parts.push(`level ${detail.min_level}`);
  if (detail.item?.name) parts.push(titleCase(detail.item.name));
  if (detail.held_item?.name) parts.push(`holding ${titleCase(detail.held_item.name)}`);
  if (detail.min_happiness) parts.push(`friendship ${detail.min_happiness}`);
  if (detail.time_of_day) parts.push(`at ${detail.time_of_day}`);
  if (detail.known_move?.name) parts.push(`knowing ${titleCase(detail.known_move.name)}`);
  if (detail.location?.name) parts.push(`at ${titleCase(detail.location.name)}`);
  return parts.join(', ');
};

/** Flatten an evolution chain tree into stages, in order. */
const flattenChain = (link, stage = 1, from = undefined) => [
  {speciesId: idFromUrl(link.species.url), slug: link.species.name, stage, evolvesFrom: from, method: describeEvolution(link.evolution_details)},
  ...link.evolves_to.flatMap((next) => flattenChain(next, stage + 1, link.species.name)),
];

/**
 * Research a Pokémon by National Pokédex number.
 * `fetchJson(url)` returns parsed JSON; injected so tests can use fixtures.
 */
export const researchPokemon = async (number, {fetchJson}) => {
  if (!Number.isInteger(number) || number < 1) throw new Error(`Expected a National Pokédex number, got "${number}".`);
  const species = await fetchJson(`${POKEAPI}/pokemon-species/${number}`);
  const pokemon = await fetchJson(`${POKEAPI}/pokemon/${number}`);
  const name = english(species.names, 'name') ?? titleCase(species.name);

  const chain = species.evolution_chain?.url ? flattenChain((await fetchJson(species.evolution_chain.url)).chain) : [];
  // First pass: look up each member so every name is known before linking.
  const members = [];
  for (const member of chain) {
    const isSubject = member.speciesId === number;
    const memberSpecies = isSubject ? species : await fetchJson(`${POKEAPI}/pokemon-species/${member.speciesId}`);
    const memberPokemon = isSubject ? pokemon : await fetchJson(`${POKEAPI}/pokemon/${member.speciesId}`);
    members.push({...member, isSubject, name: english(memberSpecies.names, 'name') ?? titleCase(member.slug), pokemon: memberPokemon});
  }
  const nameBySlug = new Map(members.map((member) => [member.slug, member.name]));
  const evolutionChain = members.map((member) => ({
    name: member.name,
    index: formatIndex(member.speciesId),
    stage: member.stage,
    ...(member.evolvesFrom ? {evolvesFrom: nameBySlug.get(member.evolvesFrom)} : {}),
    ...(member.method ? {method: member.method} : {}),
    types: member.pokemon.types.map((type) => titleCase(type.type.name)),
    artworkUrl: artworkFor(member.pokemon),
    isSubject: member.isSubject,
  }));

  const varieties = [];
  for (const variety of species.varieties ?? []) {
    if (variety.is_default) continue;
    const form = await fetchJson(variety.pokemon.url);
    varieties.push({
      name: titleCase(form.name),
      types: form.types.map((type) => titleCase(type.type.name)),
      heightMeters: form.height / 10,
      weightKg: form.weight / 10,
      artworkUrl: artworkFor(form),
    });
  }

  const seen = new Set();
  const pokedexEntries = (species.flavor_text_entries ?? [])
    .filter((entry) => entry.language?.name === 'en')
    .map((entry) => ({game: titleCase(entry.version?.name ?? 'unknown'), text: cleanText(entry.flavor_text)}))
    .filter((entry) => {
      const key = entry.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const slug = species.name;
  return {
    schemaVersion: 1,
    id: `${slug}-${String(number).padStart(3, '0')}`,
    number,
    index: formatIndex(number),
    name,
    slug,
    category: english(species.genera, 'genus') ?? 'Pokémon',
    generation: species.generation?.name ? `Generation ${species.generation.name.replace(/^generation-/, '').toUpperCase()}` : 'Unknown',
    isLegendary: Boolean(species.is_legendary),
    isMythical: Boolean(species.is_mythical),
    types: pokemon.types.map((type) => titleCase(type.type.name)),
    heightMeters: pokemon.height / 10,
    weightKg: pokemon.weight / 10,
    artworkUrl: artworkFor(pokemon),
    pokedexEntries,
    evolutionChain,
    varieties,
    sources: [
      {label: `Official Pokémon Pokédex — ${name}`, url: `https://www.pokemon.com/us/pokedex/${slug}`},
      {label: `Bulbapedia — ${name}`, url: `https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(`${name.replace(/ /g, '_')}_(Pokémon)`)}`},
      {label: `PokéAPI — ${name}`, url: `${POKEAPI}/pokemon-species/${number}`},
    ],
  };
};
