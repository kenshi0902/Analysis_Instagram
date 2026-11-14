/** 定期実行トリガーの登録。何度実行しても重複しない。 */
const TRIGGER_HANDLERS = ['syncStories', 'syncFollowers', 'syncMedia', 'syncAccountDaily', 'syncAccountAll', 'syncAudience', 'refreshToken'];

function installTriggers() {
  removeTriggers();
  // ストーリーの時間推移を取るため細かい周期で実行する(間隔は stories.gs の STORY_SYNC_MINUTES)
  const story = ScriptApp.newTrigger('syncStories').timeBased();
  if (STORY_SYNC_MINUTES >= 60) story.everyHours(1).create();
  else story.everyMinutes(STORY_SYNC_MINUTES).create();
  ScriptApp.newTrigger('syncFollowers').timeBased().atHour(1).everyDays(1).create();
  ScriptApp.newTrigger('syncMedia').timeBased().everyHours(6).create(); // 投稿後1/7/28日のスナップショットを取り逃さないため
  ScriptApp.newTrigger('syncAccountAll').timeBased().atHour(2).everyDays(1).create();
  ScriptApp.newTrigger('syncAudience').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(2).create();
  ScriptApp.newTrigger('refreshToken').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
  console.log('トリガーを登録しました: ' + TRIGGER_HANDLERS.join(', '));
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (TRIGGER_HANDLERS.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
}
