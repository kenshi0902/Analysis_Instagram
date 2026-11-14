/** 定期実行トリガーの登録。何度実行しても重複しない。 */
const TRIGGER_HANDLERS = ['syncStories', 'syncFollowers', 'syncMedia', 'syncAccountDaily', 'syncAudience', 'refreshToken'];

function installTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('syncStories').timeBased().everyHours(6).create();
  ScriptApp.newTrigger('syncFollowers').timeBased().atHour(1).everyDays(1).create();
  ScriptApp.newTrigger('syncMedia').timeBased().atHour(2).everyDays(1).create();
  ScriptApp.newTrigger('syncAccountDaily').timeBased().atHour(2).everyDays(1).create();
  ScriptApp.newTrigger('syncAudience').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(2).create();
  ScriptApp.newTrigger('refreshToken').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
  console.log('トリガーを登録しました: ' + TRIGGER_HANDLERS.join(', '));
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (TRIGGER_HANDLERS.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
}
