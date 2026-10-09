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
    headers: ['日付', 'フォロワー数', 'フォロー数', '投稿数', '前日比', '取得日時'],
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
