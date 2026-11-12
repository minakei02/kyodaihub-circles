import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFeed, dropProblem, safeImageUrl, toCircle } from "./circles.ts";

const s = (v: string) => ({ stringValue: v });
const doc = (id: string, fields: Record<string, unknown>) => ({
  document: { name: `projects/kyodaihub/databases/(default)/documents/circles/${id}`, fields },
});

test("公開中のサークルだけを、決まった項目だけで入れる", () => {
  const feed = buildFeed(
    [
      doc("b", { name: s("B"), status: s("published"), sortOrder: { integerValue: "20" }, loadTest: { booleanValue: true }, sourceUrl: s("https://x") }),
      doc("a", { name: s("A"), status: s("published"), sortOrder: { integerValue: "10" }, tags: { arrayValue: { values: [s("登山"), s("")] } } }),
      doc("draft", { name: s("下書き"), status: s("draft") }),
      { readTime: "2026-11-12T00:00:00Z" },
    ],
    new Date("2026-11-12T00:00:00Z"),
  );
  assert.equal(feed.version, 1);
  assert.equal(feed.count, 2);
  assert.deepEqual(feed.circles.map((c) => c.id), ["a", "b"]);
  assert.deepEqual(feed.circles[0].tags, ["登山"]);
  // 決めた項目以外（目印・元のページなど）は配信ファイルに入れない
  assert.equal("loadTest" in feed.circles[1], false);
  assert.equal("sourceUrl" in feed.circles[1], false);
});

test("名前が無い・番号がおかしいものは入れない", () => {
  assert.equal(toCircle({ name: "x/circles/ok", fields: { status: s("published") } }), null);
  assert.equal(toCircle({ name: "x/circles/bad id", fields: { name: s("A"), status: s("published") } }), null);
});

test("写真の URL は https だけ", () => {
  assert.equal(safeImageUrl("https://example.com/a.png"), "https://example.com/a.png");
  assert.equal(safeImageUrl("http://example.com/a.png"), "");
  assert.equal(safeImageUrl("javascript:alert(1)"), "");
  assert.equal(safeImageUrl(""), "");
});

test("前回より半分を超えて減ったら止める（減ってもよいときは止めない）", () => {
  assert.equal(dropProblem(230, 230, false), null);
  assert.equal(dropProblem(230, 120, false), null);
  assert.notEqual(dropProblem(230, 100, false), null);
  assert.equal(dropProblem(230, 0, true), null);
  assert.equal(dropProblem(null, 0, false), null);
  assert.equal(dropProblem(5, 0, false), null);
});
