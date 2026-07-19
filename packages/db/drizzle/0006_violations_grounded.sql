-- Порушення (content_items.violations) переходять з РЯДКІВ на об'єкти {quote, issue} (§7.5).
--
-- Навіщо: раніше Reviewer писав у violations вільний текст, і туди регулярно потрапляли «none»,
-- «-» та описи ВІДСУТНОСТІ порушень («Немає явних порушень…»). Оскільки прапорець flagged —
-- похідне від violations.length > 0, він спрацьовував майже на кожному пості й нічого не означав.
-- Нова форма вимагає ЦИТАТУ з тексту поста, і код звіряє її з текстом (groundViolations),
-- тож «відзвітувати про відсутність» стало неможливо — процитувати відсутність нема чого.
--
-- Міграція даних: старий рядок стає issue, quote лишається порожнім (для історичних рядків
-- цитату відновити нізвідки). UI показує такі записи без блоку цитати. Без цього перетворення
-- сторінка рецензії падала б на старих прогонах — контракт чекає об'єкти, а в БД лежали рядки.
UPDATE content_items
SET violations = (
  SELECT jsonb_agg(jsonb_build_object('quote', '', 'issue', elem))
  FROM jsonb_array_elements_text(violations) AS elem
)
WHERE jsonb_typeof(violations) = 'array'
  AND jsonb_array_length(violations) > 0
  AND jsonb_typeof(violations -> 0) = 'string';
