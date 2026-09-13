import { Result, Schema } from "effect";

const skillRoot = ".agents/skills";
const skillDirectoryGlob = new Bun.Glob("*/SKILL.md");
const names = new Set<string>();
const errors: string[] = [];
let count = 0;

/**
 * Skills installed from elsewhere through skills-lock.json are checked by
 * their own authors. This gate is for the skills written in this repository,
 * so a vendored pack with a long description does not fail a build it is not
 * part of.
 */
const Lock = Schema.Struct({
  skills: Schema.Record(
    Schema.String,
    Schema.Struct({ sourceType: Schema.optional(Schema.String) })
  ),
});
const lock = Schema.decodeUnknownResult(Schema.fromJsonString(Lock))(
  await Bun.file("skills-lock.json").text()
);
const vendored = new Set(
  Result.isSuccess(lock)
    ? Object.entries(lock.success.skills)
        .filter(([, entry]) => entry.sourceType === "github")
        .map(([name]) => name)
    : []
);

for await (const relativePath of skillDirectoryGlob.scan({
  cwd: skillRoot,
  onlyFiles: true,
})) {
  const [owner] = relativePath.split("/");
  if (owner !== undefined && vendored.has(owner)) {
    continue;
  }
  count += 1;
  const path = `${skillRoot}/${relativePath}`;
  const source = await Bun.file(path).text();
  const frontmatter = /^---\r?\n(?<matter>[\s\S]*?)\r?\n---/u.exec(source)
    ?.groups?.["matter"];
  if (frontmatter === undefined) {
    errors.push(`${path}: missing YAML frontmatter`);
  } else {
    try {
      Bun.YAML.parse(frontmatter);
    } catch {
      errors.push(`${path}: invalid YAML frontmatter`);
    }
  }
  const [folder] = relativePath.split("/");
  const nameMatch = /^name:\s*(?<name>[^\n]+)$/mu.exec(source);
  const descriptionMatch = /^description:\s*(?<description>.+)$/mu.exec(source);
  const name = nameMatch?.groups?.["name"]?.trim();
  const description = descriptionMatch?.groups?.["description"]?.trim();

  if (folder === undefined) {
    errors.push(`${path}: missing skill folder`);
  } else if (name === undefined || name !== folder) {
    errors.push(`${path}: frontmatter name must match '${folder}'`);
  } else if (names.has(name)) {
    errors.push(`${path}: duplicate skill name '${name}'`);
  } else {
    names.add(name);
  }

  if (
    description === undefined ||
    description.length < 20 ||
    description.length > 220
  ) {
    errors.push(`${path}: description must be 20-220 characters`);
  }
  if (source.includes("TODO")) {
    errors.push(`${path}: unfinished TODO placeholder`);
  }
}

if (count === 0) {
  errors.push(`${skillRoot}: no repository skills found`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exitCode = 1;
} else {
  console.info(`Agent file check passed (${count} skills)`);
}
