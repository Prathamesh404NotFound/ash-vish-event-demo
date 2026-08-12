import { adminIdToken, DB_HOST } from "./db_admin";

const [ev, seatId] = process.argv.slice(2);
const tok = await adminIdToken();
const seat: any = await fetch(`${DB_HOST}/seats/${ev}/${seatId}.json?auth=${encodeURIComponent(tok)}`).then((r) =>
  r.json()
);
console.log(seat?.status || "?");
process.exit(0);
