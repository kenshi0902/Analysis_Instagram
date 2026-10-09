# Analysis_Instagram
Instagramのデータを取得・集計・可視化して分析するためのソースコード集です。

## 目的

<!-- 何を明らかにしたいか(例: 投稿ごとのエンゲージメント傾向、フォロワー推移、投稿時間帯の最適化など) -->
- TODO: 分析の目的を記入

## 分析対象データ

| 項目 | 内容 |
|---|---|
| 対象アカウント | TODO |
| 取得方法 | TODO(Instagram Graph API / データエクスポート など) |
| 期間 | TODO |
| 主な指標 | TODO(いいね数、コメント数、リーチ、保存数 など) |

> 生データ・認証情報は個人情報を含むため Git 管理しません(`.gitignore` で `data/`、`.env`、`*.csv`、`*.json` などを除外)。

## ディレクトリ構成(予定)

```
Analysis_Instagram/
├── README.md
├── .gitignore
├── data/        # 生データ・中間データ(Git管理外)
├── src/         # 取得・前処理・分析のスクリプト
├── notebooks/   # 探索的分析用ノートブック
└── outputs/     # グラフ・レポートなどの出力
```

## セットアップ

```bash
git clone git@github.com:kenshi0902/Analysis_Instagram.git
cd Analysis_Instagram
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt   # TODO: 作成後に有効化
```

### 環境変数

`.env` を作成して設定します(Git管理外)。

```
# TODO: 必要になったキーを記入
INSTAGRAM_ACCESS_TOKEN=
```

## 使い方

TODO: スクリプトの実行手順を追記

## 開発メモ

- ブランチ運用: `main` から作業ブランチを切り、変更後にマージする
- コミット前に `git status` で、データや認証情報が含まれていないことを確認する
