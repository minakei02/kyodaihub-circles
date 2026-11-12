// Firestore から公開中のサークルを読み、dist/circles.json を作る。
// 鍵は使わない（公開中のサークルは、もともとだれでも読めるデータ。読むだけで、書き込みはしない）。
// 使い方: node src/sync.ts [--previous-site https://…/] [--allow-drop]

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { QUERY_URL, buildFeed, dropProblem, publishedQuery } from "./circles.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function previousCount(site: string | undefined): Promise<number | null> {
  if (!site) return null;
  try {
    const res = await fetch(new URL("circles.json", site), { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null; // まだ一度も公開していないときなど
    const feed = (await res.json()) as { count?: unknown };
    return typeof feed.count === "number" ? feed.count : null;
  } catch {
    return null;
  }
}

async function main() {
  const res = await fetch(QUERY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(publishedQuery()),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Firestore から読めません（${res.status}）`);
  const feed = buildFeed(await res.json(), new Date());

  const previous = await previousCount(arg("--previous-site"));
  const problem = dropProblem(previous, feed.count, process.argv.includes("--allow-drop"));
  if (problem) throw new Error(problem);

  await mkdir("dist", { recursive: true });
  const body = JSON.stringify(feed, null, 1) + "\n";
  await writeFile("dist/circles.json", body);
  // リポジトリに残す記録は、件数と中身の指紋だけ（サークルの中身そのものは公開リポジトリの履歴に残さない。消したあとも残り続けるため）
  const { generatedAt: _, ...content } = feed;
  const sha256 = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  await mkdir("record", { recursive: true });
  // 月も入れておく（中身が変わらなくても月に1回は記録が残り、60日間動きがなくて定期実行が止まるのを防ぐ）
  const month = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
  await writeFile("record/summary.json", JSON.stringify({ month, count: feed.count, sha256 }, null, 1) + "\n");
  const withPhoto = feed.circles.filter((c) => c.coverImageUrl || c.thumbnailImageUrl).length;
  console.log(`circles.json を作りました: ${feed.count} 件（写真あり ${withPhoto}）。前回 ${previous ?? "なし"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
