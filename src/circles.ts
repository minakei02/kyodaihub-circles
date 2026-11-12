// Firestore の公開中のサークルを、アプリと Web 用の配信ファイル（circles.json）の形にする。
// 読み込み・書き出しをしない純粋な関数だけを置く（テストしやすくするため）。

export const PROJECT_ID = "kyodaihub";
export const QUERY_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

/** 配信ファイルに入れるサークルの上限（壊れたデータで際限なく大きくならないように） */
export const MAX_CIRCLES = 2000;
/** 文の長さの上限（1件が大きすぎるとファイル全体が重くなる） */
const MAX_TEXT = 6000;
const MAX_SHORT = 300;
const MAX_TAGS = 20;
/** 前回より半分を超えて減ったら、間違いかもしれないので公開しない（前回の内容が残る） */
const DROP_GUARD_MIN_PREVIOUS = 10;

export type Circle = {
  id: string;
  name: string;
  summary: string;
  description: string;
  category: string;
  members: string;
  activityFrequency: string;
  activityDays: string[];
  activityPlace: string;
  recruitmentStatus: string;
  tags: string[];
  thumbnailImageUrl: string;
  coverImageUrl: string;
  sortOrder: number;
};

export type Feed = {
  version: 1;
  generatedAt: string;
  count: number;
  circles: Circle[];
};

/** 公開中（status = published）だけを、上限+1件まで読む問い合わせ。読んだ件数だけ Firestore の読み取りになる */
export function publishedQuery() {
  return {
    structuredQuery: {
      from: [{ collectionId: "circles" }],
      where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "published" } } },
      limit: MAX_CIRCLES + 1,
    },
  };
}

type FirestoreValue = Record<string, unknown>;
type FirestoreDocument = { name?: unknown; fields?: Record<string, FirestoreValue> };

function str(fields: Record<string, FirestoreValue>, key: string, max = MAX_SHORT): string {
  const value = fields[key]?.stringValue;
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function strArray(fields: Record<string, FirestoreValue>, key: string, maxItems: number): string[] {
  const values = (fields[key]?.arrayValue as { values?: FirestoreValue[] } | undefined)?.values ?? [];
  return values
    .map((v) => (typeof v.stringValue === "string" ? v.stringValue.trim().slice(0, MAX_SHORT) : ""))
    .filter((v) => v !== "")
    .slice(0, maxItems);
}

function num(fields: Record<string, FirestoreValue>, key: string): number {
  const v = fields[key];
  const n = typeof v?.integerValue === "string" ? Number(v.integerValue) : typeof v?.doubleValue === "number" ? v.doubleValue : 0;
  return Number.isFinite(n) ? n : 0;
}

/** 写真の URL は https だけを通す（http や javascript: などは捨てる） */
export function safeImageUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && raw.length <= 2000 ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Firestore の1件を、配信ファイルの1件にする。公開中でない・名前が無い・番号がおかしいものは null */
export function toCircle(doc: FirestoreDocument): Circle | null {
  const fields = doc.fields ?? {};
  const id = typeof doc.name === "string" ? (doc.name.split("/").pop() ?? "") : "";
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
  // 問い合わせで絞っているが、念のためここでも確かめる（下書きを配信ファイルに入れない）
  if (str(fields, "status") !== "published") return null;
  const name = str(fields, "name");
  if (name === "") return null;
  return {
    id,
    name,
    summary: str(fields, "summary", MAX_TEXT),
    description: str(fields, "description", MAX_TEXT),
    category: str(fields, "category"),
    members: str(fields, "members"),
    activityFrequency: str(fields, "activityFrequency"),
    activityDays: strArray(fields, "activityDays", 7),
    activityPlace: str(fields, "activityPlace"),
    recruitmentStatus: str(fields, "recruitmentStatus"),
    tags: strArray(fields, "tags", MAX_TAGS),
    thumbnailImageUrl: safeImageUrl(str(fields, "thumbnailImageUrl", 2000)),
    coverImageUrl: safeImageUrl(str(fields, "coverImageUrl", 2000)),
    sortOrder: num(fields, "sortOrder"),
  };
}

/** runQuery の答えから配信ファイルを作る。並びは管理画面の並び順 → 番号の順（毎回同じ順にして差分を見やすく） */
export function buildFeed(rows: unknown, now: Date): Feed {
  if (!Array.isArray(rows)) throw new Error("Firestore の答えの形が想定と違います");
  const docs = rows
    .map((row) => (row as { document?: FirestoreDocument }).document)
    .filter((doc): doc is FirestoreDocument => doc !== undefined);
  if (docs.length > MAX_CIRCLES) throw new Error(`公開中のサークルが上限 ${MAX_CIRCLES} 件を超えています（上限を見直す）`);
  const circles = docs
    .map(toCircle)
    .filter((c): c is Circle => c !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { version: 1, generatedAt: now.toISOString(), count: circles.length, circles };
}

/** 前回より大きく減っていたら止める（allowDrop のときは止めない）。理由の文を返す。問題なければ null */
export function dropProblem(previousCount: number | null, nextCount: number, allowDrop: boolean): string | null {
  if (allowDrop || previousCount === null || previousCount < DROP_GUARD_MIN_PREVIOUS) return null;
  if (nextCount * 2 < previousCount) {
    return `公開中のサークルが ${previousCount} 件から ${nextCount} 件に減りました。間違いでなければ「減ってもよい」を付けて手動で動かしてください`;
  }
  return null;
}
