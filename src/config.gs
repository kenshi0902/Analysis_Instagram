/**
 * 設定・テーブル定義。
 * 認証情報はコードに書かず、スクリプトプロパティに保存する。
 */
const TZ = 'Asia/Tokyo';
const DEFAULT_API_HOST = 'graph.facebook.com';
const DEFAULT_API_VERSION = 'v23.0';

const REQUIRED_PROPS = ['IG_ACCESS_TOKEN', 'IG_USER_ID', 'SPREADSHEET_ID'];

/**
 * 書き込み先テーブルの定義。
 * - name: シート名
 * - key: 行を一意に識別する列(upsertの突き合わせに使う)
 * - headers: スクリプトが管理する列。ここに無い列(手入力列・数式列)には触れない。
 */
const TABLES = {
  stories: {
    name: 'ストーリーズインサイト',
    key: 'ストーリーID',
    headers: [
      'ストーリーID', '投稿日時', '月', '曜日', 'URL',
      '閲覧数', 'リーチ', '返信', 'シェア', 'インタラクション合計',
      'フォロー', 'プロフィール訪問',
      '次へ', '戻る', '終了', '次のアカウントへ',
      '取得日時',
    ],
  },
  followers: {
    name: 'フォロワー数',
    key: '日付',
    headers: ['日付', 'フォロワー数', 'フォロー数', '投稿数', '前日比', '種別', '取得日時'],
  },
  // 以下は手入力の既存タブと混ざらないよう、API専用タブ(API_ 接頭辞)に書き込む。
  feed: {
    name: 'API_フィード',
    key: 'メディアID',
    headers: [
      'メディアID', '投稿日時', '種類', 'URL', 'キャプション', 'サムネイルURL',
      '閲覧数', 'リーチ', 'いいね', 'コメント', '保存', 'シェア', 'インタラクション合計',
      'フォロー', 'プロフィール訪問', '取得日時',
    ],
  },
  reels: {
    name: 'API_リール',
    key: 'メディアID',
    headers: [
      'メディアID', '投稿日時', 'URL', 'キャプション', 'サムネイルURL',
      '閲覧数', 'リーチ', 'いいね', 'コメント', '保存', 'シェア', 'インタラクション合計',
      '平均視聴時間(秒)', '合計視聴時間(秒)', 'フォロー', 'プロフィール訪問', '取得日時',
    ],
  },
  // 投稿後 N 日時点の値。経過日数を揃えて投稿を比べるために使う。
  mediaSnapshots: {
    name: 'API_投稿推移',
    key: 'キー',
    headers: [
      'キー', 'メディアID', '形式', '投稿日時', '経過日数', '経過時間(h)',
      '閲覧数', 'リーチ', 'いいね', 'コメント', '保存', 'シェア', 'インタラクション合計',
      'フォロー', 'プロフィール訪問', '平均視聴時間(秒)', '取得日時',
    ],
  },
  // 期間のユニーク値(リーチ等は日次値を足すと重複するため、期間指定で別に取得する)。
  accountPeriod: {
    name: 'API_アカウント期間',
    key: '期間キー',
    headers: ['期間キー', '粒度', '開始日', '終了日', 'リーチ', 'エンゲージしたアカウント', '状態', '取得日時'],
  },
  accountDaily: {
    name: 'API_アカウント日次',
    key: '日付',
    headers: [
      '日付', 'リーチ', '閲覧数', 'エンゲージしたアカウント', 'インタラクション合計',
      'いいね', 'コメント', '保存', 'シェア', '返信', 'プロフィール訪問', 'プロフィールリンクタップ',
      'フォロー増', 'フォロー解除', 'フォロワー純増', '取得日時',
    ],
  },
  audience: {
    name: 'API_オーディエンス',
    key: 'キー',
    headers: ['キー', '対象', '区分', '項目', '人数', '取得日時'],
  },
};

function getConfig_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const missing = REQUIRED_PROPS.filter(function (k) { return !props[k]; });
  if (missing.length) {
    throw new Error('スクリプトプロパティが未設定です: ' + missing.join(', '));
  }
  return {
    token: props.IG_ACCESS_TOKEN,
    userId: props.IG_USER_ID,
    spreadsheetId: props.SPREADSHEET_ID,
    host: props.IG_API_HOST || DEFAULT_API_HOST,
    version: props.IG_API_VERSION || DEFAULT_API_VERSION,
  };
}
