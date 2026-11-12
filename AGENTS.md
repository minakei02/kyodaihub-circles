# kyodaihub-circles — AI / 開発者向け概要

チャットや PC（Mac / Windows）が変わっても、意図と制約を引き継ぐための正本。コードを触る前に読む。

## これは何か

- 京大ポケットの Firestore（プロジェクト `kyodaihub`）から**公開中（`status` が `published`）のサークル**を6時間ごとに読み、
  配信ファイル `circles.json` にまとめて GitHub Pages（`https://minakei02.github.io/kyodaihub-circles/circles.json`）で配る。
- 目的は**サーバー代を人数に比例させないこと**（2026-11-12）。前はアプリを開くたびに Firestore からサークルを100件読んでいた（1回開くと100回の読み取り）。
  今は Firestore を読むのはここの1回（公開中の件数ぶん）だけで、アプリは何人が何回開いてもこのファイルを読むだけ。「最大100件」の上限もなくなった。
- イベント（`../kyodaihub-events`）・授業（`../kyodaihub-courses`）と同じ作り。
- 正本は今までどおり Firestore（管理画面 `../kyodaihubAdmin` で編集）。ここは写しを作るだけ。

## 守ること

1. **鍵を使わない・書き込まない。** Firestore の REST API を鍵なしで読むだけ（公開中のサークルは、もともとだれでも読めるデータ）。GitHub の Secrets も使わない。
2. **下書きを入れない。** 問い合わせで `published` に絞り、`src/circles.ts` の `toCircle` でもう一度確かめる。
3. **入れる項目は決めたものだけ**（`Circle` の型）。管理用の項目（`loadTest`・`sourceUrl`・作成日など）は入れない。写真の URL は https だけ。
4. **安全装置を外さない。** 読めない・形が違う・前回の半分より少ない（前回10件以上のとき）ときは、公開せずに失敗で終わる（前回の内容が残る）。
   まとめて下書きにしたなど、減るのが正しいときは、Actions の「Run workflow」で「減ってもよい」に印を付けて動かす（`gh workflow run sync.yml -f allow_drop=true`）。
5. **サーバー代は0円のまま。** 外から入れるパッケージ・有料のサービスを使わない。Actions は公開リポジトリの無料枠。
   Firestore の読み取りは1回動くごとに公開中の件数ぶん（今は約230回）×1日4回。1日の無料の量（5万回）のごく一部。
6. **これは公開リポジトリ。** 鍵・トークン・個人のメールアドレスを入れない。clone した直後、コミットする前に:
   - `git config user.name "minakei02"`
   - `git config user.email "136055793+minakei02@users.noreply.github.com"`
7. ワークフローの権限は仕事ごとに最小限。使う部品は GitHub 公式（`actions/*`）だけで、版はコミットの番号で固定する。
8. **circles.json の形を変えるときは、アプリ（iOS の `Data/Clubs/ClubsFeed.swift`・Android）の読み取り側も同時に直す。** 形を大きく変えるなら `version` を上げる。
9. コミットと push は頼まれたときだけ。返答は日本語で。

## 知っておくこと

- 管理画面でサークルを直しても、アプリに出るのは次の同期のあと（最大6時間＋配信の待ち最大20分）。すぐ出したいときは `gh workflow run sync.yml`（数分で公開）。
- アプリは、このファイルが読めないときだけ Firestore を直接読む（最大100件。前の読み方）。
- `data/summary.json` は、内容が変わったときだけ Actions が残す記録（件数と中身の指紋だけ。60日間動きがないと定期実行が止まるのを防ぐ役目もある）。
  **サークルの中身そのものはリポジトリに残さない**（公開リポジトリの履歴は消せない。掲載をやめたサークルが残り続けないように）。手で編集しない。

## 動かし方（Mac / Windows）

Node.js 24 以上。`npm test` → `npm run sync`（`dist/circles.json` に出力。Firestore を公開中の件数ぶん読む）。
