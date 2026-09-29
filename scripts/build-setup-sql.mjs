#!/usr/bin/env node
/**
 * Regenera supabase/setup.sql a partir de supabase/migrations/ (em ordem).
 *
 *   node scripts/build-setup-sql.mjs          # grava o arquivo
 *   node scripts/build-setup-sql.mjs --check  # só confere (sai 1 se desatualizado)
 *
 * Rode sempre que criar uma migration nova. Montado por concatenação simples
 * — nada de String.replace com o SQL como substituição: um `$'` dentro de uma
 * regex do SQL vira padrão especial do replace e corrompe o arquivo (foi o que
 * aconteceu com o check `'^[A-Z]{3}$'`).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const target = join(root, "supabase", "setup.sql");

const HEADER = `-- =====================================================================
-- SETUP COMPLETO DO BANCO — cole INTEIRO no SQL Editor do Supabase.
--
-- Alternativa à Supabase CLI (\`npx supabase db push\`) para quem prefere
-- não instalar/logar na CLI. Gera o schema 100% reproduzível: extensões,
-- funções, tabelas, RLS, rate limit, captura, realtime e checkout.
--
-- Rode UMA VEZ SÓ, num projeto Supabase novo e vazio.
-- Gerado a partir de supabase/migrations/ (ordem preservada) por
-- scripts/build-setup-sql.mjs — NÃO edite à mão; rode o script.
-- =====================================================================

begin;
`;

const RULE = "-- ---------------------------------------------------------------------";

const files = readdirSync(migrationsDir)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

let out = HEADER;
for (const file of files) {
  let sql = readFileSync(join(migrationsDir, file), "utf8").replace(/\r\n/g, "\n");
  if (!sql.endsWith("\n")) sql += "\n";
  out += `\n${RULE}\n-- ${file}\n${RULE}\n${sql}`;
}

const history = files
  .map((file) => {
    const [, version, name] = file.match(/^(\d{14})_(.+)\.sql$/);
    return `  ('${version}', '${name}')`;
  })
  .join(",\n");

out += `
${RULE}
-- Histórico de migrations: faz um futuro \`supabase db push\` saber que
-- estas já foram aplicadas, evitando reaplicar tudo por cima.
${RULE}
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations (version, name) values
${history}
on conflict (version) do nothing;

commit;
`;

if (process.argv.includes("--check")) {
  const current = readFileSync(target, "utf8").replace(/\r\n/g, "\n");
  if (current !== out) {
    console.error("supabase/setup.sql está desatualizado — rode: node scripts/build-setup-sql.mjs");
    process.exit(1);
  }
  console.log(`setup.sql em dia (${files.length} migrations).`);
} else {
  writeFileSync(target, out);
  console.log(`setup.sql regenerado com ${files.length} migrations.`);
}
