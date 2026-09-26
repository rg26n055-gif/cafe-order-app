import './sites-env.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
// Build a local-only Wrangler config with the source migration directory.
const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
config.main=resolve('dist/server/index.js');
if(config.assets)config.assets.directory=resolve('dist/client');
for(const db of config.d1_databases)db.migrations_dir=resolve('drizzle');
mkdirSync('.sites-runtime',{recursive:true});
const path=resolve('.sites-runtime/local-migrations.json');writeFileSync(path,JSON.stringify(config));
const args=['--config',path,'--local','--persist-to','.wrangler/state'];
function run(command,extra=[]){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1',...command.split(' '),'DB',...args,...extra],{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status||1);}
// Existing v1 checkouts applied 0000 directly, before a migration ledger existed.
// Detect that case and record only the already-created v1 migration.
const query=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','DB',...args,'--json','--command',"SELECT name FROM sqlite_master WHERE type='table' AND name='products'"],{encoding:'utf8',env:process.env});
if(query.status!==0){process.stderr.write(query.stderr);process.exit(1);}
if(JSON.parse(query.stdout).some(r=>r.results?.some(row=>row.name==='products'))){
 run('execute',['--command',"CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)"]);
 run('execute',['--command',"INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0000_real_bill_hollister.sql')"]);
}
run('migrations apply');
