# CLAUDE.md — setoori-editor-demo

このファイルは Claude Code と ChatGPT が同じリポジトリを触る際の **単一の運用ルール** です。最優先で守ってください。

## 0. 絶対ルール

1. **main を直接編集・pushしない。**
2. 作業開始前に必ず `git status`, `git branch --show-current`, `git log --oneline -5` を確認する。
3. 既存変更を消す操作は禁止。`reset --hard`, 強制push, 無断rebase, 大規模一括置換は禁止。
4. 仕様が不明な場合は推測で実装しない。`[要確認]` または TODO を残し、既存挙動を維持する。
5. 変更前後で diff を確認し、意図しない削除・巻き戻りがないことを確認する。
6. 1コミット1目的を原則とする。巨大コミットにしない。
7. UI/UX変更とデータモデル変更を同一コミットに混ぜない。
8. 現在の顧客向け編集フローを壊さない。
9. PoCの localStorage 実装を「本番完成」と扱わない。
10. 他AIが追加したファイルを『不要そう』という理由で削除しない。

---

## 1. 現在の正しい作業基点

Repository: `kotaro/setoori-editor-demo`

Current feature branch: `feat/admin-config-ux`

Open PR: `#1 Add configurable system maintenance UI and configured editor`

このPRでは以下が追加されています。

- `admin.html` — システム管理画面
- `admin.css` — 管理画面UI
- `admin.js` — 商品仕様 / プリフライト / 価格納期 / テンプレート管理
- `runtime-config.js` — localStorage設定をエディタ実行時に反映するブリッジ
- `editor.html` — 管理設定を読み込むエディタ入口

### 重要
`index.html` / `app.js` は既存PoCの基盤です。機能追加のために全面書き換えしないでください。

---

## 2. 製品の方向性

現在の位置付けは「瀬戸織ネーム専用エディタ」から、将来的に下記へ拡張する途中です。

**Manufacturing Commerce OS**

顧客フロー:

`商品選択 -> テンプレート -> 編集 -> プレビュー -> 製造可否プリフライト -> 数量 -> 見積依頼 -> 受注側処理`

管理者フロー:

`商品仕様 -> 製造ルール -> 価格/納期 -> テンプレート -> 公開`

Customer UX と Manufacturing Maintenance は分離してください。

---

## 3. 今回の最優先ゴール

管理画面から製造会社が **コードを触らずに仕様を変更できること**。

優先順位:

1. 商品仕様管理
2. プリフライト閾値管理
3. 価格・納期ルール管理
4. テンプレート表示/並び/追加
5. 将来: 新商品そのものを管理画面から追加
6. 将来: IF -> THEN の Rule Builder
7. 将来: tenant / role / audit log / versioning

---

## 4. 現在のデータ責務

既存 `app.js` に以下が直書きされています。

- `PRODUCTS`
- `PF`
- `EST`
- `TEMPLATES`

現Featureでは、`admin.js` が localStorage に設定を書き、`runtime-config.js` が起動時に override します。

これは **PoC用の暫定アーキテクチャ** です。

本番化時は以下へ移行予定です。

```text
tenant
├─ products
├─ manufacturing_rules
├─ pricing_rules
├─ materials
├─ colors
├─ templates
├─ template_versions
├─ preflight_rules
├─ roles
└─ audit_logs
```

Claude Code は、ユーザー明示指示なしにSupabase等へ勝手に大移行しないでください。

---

## 5. UX非交渉事項

顧客画面は『製造設定ツール』に見せないこと。

顧客には基本的に以下だけを見せます。

- 何を作るか
- テンプレート
- 文字/画像/色/素材
- 仕上がり
- 製造可能か
- 価格感
- 見積依頼

管理用の閾値・倍率・ルール式を顧客画面へ露出しないでください。

### 次に推奨するUX改善

- 用途起点の開始画面
- Template-first
- リアルタイムプリフライト
- 進行ステップ表示
- Error / Warning / OK の理由を具体化
- スマホで誤操作しにくい編集導線

---

## 6. Claude Code 作業開始手順

必ず以下の順で実行してください。

```bash
git fetch origin
git status
git branch --show-current
git log --oneline --decorate -5
git diff
```

ブランチが `feat/admin-config-ux` でない場合、現在作業が無いことを確認してから:

```bash
git switch feat/admin-config-ux
git pull --ff-only origin feat/admin-config-ux
```

未コミット変更がある場合は **勝手にcheckoutしない**。変更内容を確認してから作業してください。

---

## 7. 実装時の単位

推奨ブランチ運用:

- 小変更: `feat/admin-config-ux` 上で1目的コミット
- 大変更: `feat/admin-config-ux` から `claude/<task-name>` を切る

例:

```bash
git switch feat/admin-config-ux
git pull --ff-only
git switch -c claude/realtime-preflight
```

完了後:

```bash
git status
git diff --check
git diff
git add <必要ファイルだけ>
git commit -m "feat: add realtime preflight feedback"
git push -u origin claude/realtime-preflight
```

**`git add .` を機械的に使わない。** 必要ファイルだけ add してください。

---

## 8. コミット前チェック

最低限、以下を確認してください。

### 機能
- エディタが起動する
- テンプレートを選べる
- テキスト編集できる
- プレビューできる
- 見積依頼モーダルが開く
- プリフライトが壊れていない
- 管理画面が開く
- 管理設定保存後に `editor.html` 側へ反映される

### 巻き戻り防止

```bash
git diff --stat
git diff --check
git diff origin/feat/admin-config-ux...HEAD
```

意図せず `app.js` の大部分が削除・置換されていたら **コミットしない**。

---

## 9. ファイルごとの扱い

### `app.js`
既存業務ロジックの中心。最も破壊リスクが高い。
- 全面リファクタ禁止
- 既存定数を削除して一気に新方式へ置換しない
- incremental change 優先

### `index.html`
既存PoC入口。後方互換用として維持。

### `editor.html`
管理設定を反映する顧客向け確認入口。

### `admin.html / admin.js / admin.css`
運用者向け。Customer UXと分離。

### `runtime-config.js`
既存ロジックと管理設定を繋ぐ暫定互換層。

---

## 10. 不明事項の扱い

以下は現在確定していません。

- 実際の製造単価
- 正式な納期係数
- 一部商品の最小文字サイズ
- 金銀/蛍光の正式制約
- 本番認証方式
- tenant課金設計
- 本番DB schema
- 決済方式

これらを断定値に変えないでください。
既存の `[要確認]` を勝手に外さないでください。

---

## 11. 仕様変更時の記録形式

Claude Code は作業終了時に必ず以下をユーザーへ返してください。

```text
[BRANCH]
作業ブランチ名

[BASE]
開始時のcommit SHA

[COMMITS]
今回作成したcommit SHAと要約

[CHANGED]
変更ファイル一覧

[BEHAVIOR]
何ができるようになったか

[NOT CHANGED]
意図的に変更していない領域

[TESTED]
実施した確認

[KNOWN LIMITATIONS]
未実装 / 不明 / PoC制約

[NEXT]
次に安全に進める作業
```

これにより ChatGPT 側でも状態を照合できます。

---

## 12. ChatGPTとの連携ルール

ユーザーがChatGPTとClaude Codeの両方を使うため、**GitHubを唯一の状態共有地点**とします。

会話内容を真実のソースにしないでください。

優先順位:

1. Git commit / branch / PR
2. `CLAUDE.md`
3. repository docs
4. Issue / PR discussion
5. チャット上の説明

Claude Code が変更を終えたら必ず push してください。
ChatGPT側が変更する前にもGitHub上の最新HEADを確認します。

---

## 13. コンフリクト時

Claude Code が想定していたコードと GitHub HEAD が違う場合:

**止めてください。**

自動的に『こちらが正しい』と判断して上書きしないこと。

次を表示してください。

```bash
git status
git log --oneline --decorate -10
git diff
git diff <expected-sha>..HEAD --stat
```

その差分を確認してから続行します。

---

## 14. 現在の次候補

次の有力タスクは以下ですが、一度に全部実装しません。

1. 管理設定の適用テスト / バグ修正
2. リアルタイムプリフライト
3. 商品追加を完全データ駆動化
4. Rule Builder
5. DB / tenant化

特に `3` 以降は設計変更が大きいため、別ブランチ・別PRを推奨します。

---

## 15. 最終原則

**動く既存機能を守りながら、設定をコード外へ1段ずつ移す。**

新しいアーキテクチャの美しさより、
- 巻き戻らない
- 顧客フローが壊れない
- 差分が追える
- いつでも前のcommitへ戻せる

ことを優先してください。
