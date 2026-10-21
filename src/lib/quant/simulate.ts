/**
 * Offline simulation harness (Section 17.3 / Stage 0): known latent EV, honest and strategic judges.
 * Run: npx tsx src/lib/quant/simulate.ts
 * Prints mean score by judge type so the pilot can see whether the peer-predictive proxy rewards
 * useful independent information rather than conformity or overconfidence.
 */
import { prior, cap, buildPool, scoreForecast, type OpinionInput } from "./model";

type JudgeType = "honest_expert" | "honest_noisy" | "overconfident_wrong" | "copycat" | "contrarian_right" | "contrarian_wrong";

interface Judge {
  id: string;
  type: JudgeType;
  confidence: OpinionInput["confidence"];
  noise: number; // log-scale std of private signal
  bias: number; // log-scale bias
}

function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function makeJudges(): Judge[] {
  const js: Judge[] = [];
  const push = (type: JudgeType, n: number, confidence: Judge["confidence"], noise: number, bias: number) => {
    for (let i = 0; i < n; i++) js.push({ id: `${type}-${i}`, type, confidence, noise, bias });
  };
  push("honest_expert", 4, "high", 0.12, 0);
  push("honest_noisy", 6, "medium", 0.35, 0);
  push("overconfident_wrong", 2, "high", 0.15, 0.6);
  push("copycat", 2, "medium", 0.05, 0); // reports the current crowd median, not a private signal
  push("contrarian_right", 1, "high", 0.1, 0);
  push("contrarian_wrong", 1, "high", 0.1, -0.7);
  return js;
}

function simulateListing(rng = Math.random) {
  const trueLogEv = Math.log(2_000_000 + rng() * 6_000_000);
  const askBias = 0.15 + randn() * 0.15; // sellers ask above value on average
  const ask = Math.exp(trueLogEv + askBias);
  const base = prior({ askingPrice: ask, earnings: Math.exp(trueLogEv) / 3.2, earningsType: "sde", industry: "services" })!;
  const judges = makeJudges().sort(() => rng() - 0.5);
  // contrarians go first so they look wrong initially
  judges.sort((a, b) => (a.type.startsWith("contrarian") ? -1 : 0) - (b.type.startsWith("contrarian") ? -1 : 0));

  const opinions: OpinionInput[] = [];
  const contracts: Array<{ judge: Judge; fBefore: ReturnType<typeof buildPool>; y: number; idx: number; c: number }> = [];
  const crowdMean = () => (opinions.length ? opinions.reduce((s, o) => s + o.logValue, 0) / opinions.length : Math.log(ask));
  for (const j of judges) {
    let y: number;
    if (j.type === "copycat") y = crowdMean() + randn() * j.noise;
    else y = trueLogEv + j.bias + randn() * j.noise;
    const fBefore = buildPool(base, opinions);
    const op: OpinionInput = { id: j.id, logValue: y, confidence: j.confidence, orgKey: null };
    contracts.push({ judge: j, fBefore, y, idx: opinions.length, c: cap(fBefore.nEff) });
    opinions.push(op);
  }
  return contracts.map((c) => {
    const later = opinions.slice(c.idx + 1).map((o) => o.logValue);
    const { score } = scoreForecast({ fBefore: c.fBefore, logValue: c.y, confidence: c.judge.confidence, cap: c.c }, later);
    return { type: c.judge.type, score, norm: score / c.c };
  });
}

function main() {
  const totals = new Map<JudgeType, { n: number; score: number; norm: number }>();
  const runs = Number(process.argv[2] ?? 300);
  for (let r = 0; r < runs; r++) {
    for (const row of simulateListing()) {
      const t = totals.get(row.type) ?? { n: 0, score: 0, norm: 0 };
      t.n++;
      t.score += row.score;
      t.norm += row.norm;
      totals.set(row.type, t);
    }
  }
  console.log(`Peer-predictive scoring simulation over ${runs} listings\n`);
  console.log("judge type              mean score   mean normalized");
  for (const [type, t] of [...totals.entries()].sort((a, b) => b[1].norm / b[1].n - a[1].norm / a[1].n)) {
    console.log(`${type.padEnd(24)}${(t.score / t.n).toFixed(2).padStart(10)}${(t.norm / t.n).toFixed(3).padStart(18)}`);
  }
  console.log("\nRead: honest experts and early correct dissenters should rank above copycats and overconfident-");
  console.log("wrong judges. A peer proxy can still misrank a lone correct contrarian when later judges share a");
  console.log("bias; that is the known limitation of scoring without ground truth.");
}

main();
