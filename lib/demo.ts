import type { Token, Interval } from "./screener";
// Fictional fixtures. Never used as a silent fallback for live API failures.
export function demoTokens(interval: Interval): Token[] {
  const rows = [
    ["ORBIT", "Orbit Cat", "fourmeme", 0.00247, 2470000, 184300, 683200, 42.8, .4, 2841, .18, .07, 9],
    ["BAMBOO", "Bamboo Club", "pancakeswap", 0.0000182, 1820000, 263800, 492000, 18.6, 4.2, 3920, .24, .12, 12],
    ["MOCHI", "Mochi on BNB", "fourmeme", 0.000392, 392000, 72800, 312400, 86.2, .13, 843, .31, .18, 3],
    ["NIMBUS", "Nimbus", "flap", 0.0142, 1420000, 118400, 287600, -8.4, 12.5, 1924, .22, .08, 7],
    ["KITE", "Golden Kite", "fourmeme", 0.0000658, 658000, 94700, 218000, 24.3, 1.8, 1628, .27, .14, 5],
    ["PLUM", "Plum Finance", "pancakeswap", 0.083, 8300000, 492400, 198300, 3.8, 71, 9421, .14, .04, 18],
    ["TINY", "Tiny Tiger", "fourmeme", 0.000084, 84000, 18200, 96800, 112.3, .05, 187, .62, .4, 0],
    ["BOLT", "Bolt Bunny", "flap", 0.00089, 890000, 83700, 127800, -12.7, 8.3, 1822, .29, .21, 4],
    ["SORA", "Sora Cloud", "fourmeme", 0.000212, 212000, 41000, 88700, 34.5, .6, 613, .36, .19, 2],
    ["EMBER", "Ember Fox", "pancakeswap", 0.0061, 6100000, 301000, 168400, 7.1, 31.2, 6293, .19, .06, 11],
    ["COZY", "Cozy Panda", "fourmeme", 0.000118, 118000, 32100, 47200, 9.4, .2, 312, .42, .22, 1],
    ["LUNA", "Luna Finch", "flap", 0.000782, 782000, 64100, 76500, -4.6, 6.1, 1294, .25, .11, 4],
  ];
  return rows.map((r,i) => ({ address: "0x" + (i+1).toString(16).padStart(40,"0"), symbol: String(r[0]), name: String(r[1]), platform: String(r[2]), price: Number(r[3]), marketCap: Number(r[4]), liquidity: Number(r[5]), volume: Number(r[6]) * (interval === "24h" ? 7 : interval === "6h" ? 3 : 1), change: Number(r[7]), createdAt: Date.now()/1000 - Number(r[8])*3600, holders: Number(r[9]), top10: Number(r[10]), rug: Number(r[11]), smartMoney: Number(r[12]), buys: 321+i*71, sells: 210+i*24, honeypot: false, verified: true, washTrading: false, source: "demo", pairUrl: null }));
}
