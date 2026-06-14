# Inbox matching examples

Real cases from this repository. Use them to calibrate scoring.

## mos.ru export with id and title in filename

**PDF:** `17-65-6736∕26_… идентификатор： 57492186 Пробка блокирует автобус на Анохина по вечерам.pdf`

**Case:** `ZAO/troparyovo/anokhina bus lane`

**Signals:**
- `title_from_filename` = `Заголовок:` in request
- PDF body: «…по вопросу организации выделенной полосы… на улице Академика Анохина»
- location: Анохина; topic: выделенная полоса

## mos.ru export with mos_id in request

**PDF:** `…идентификатор： 57562719 Нужна разметка для парковки СИМ у м. Тропарёво выход 2.pdf`

**Case:** `ZAO/troparyovo/cycle-marking-troparyovo`

**Signals:**
- `mos_id` 57562719 = `Номера обращений:` in request
- title match
- content: «разметка», «Тропарёво»

## Prefecture reply without title in filename

**PDF:** `01-05-7893-26 Сидорчику И.А..pdf`

**Case:** `SVAO/pedestrian-crossings/vereskovaya`

**Signals:**
- PDF body: `на № 57518823 от 31.03.2026`
- PDF body: «…пешеходного перехода на Вересковой улице…»
- note: vereskovaya request has no mos_id field, but response cites 57518823 from the original appeal

## Scanner filename, content-only match

**PDF:** `SCN_20260423_092950.pdf`

**Case:** `SVAO/pedestrian-crossings/zapovednaya`

**Signals:**
- filename is not helpful
- PDF body mentions «Заповедной улице» and pedestrian crossing topic

## Filename patterns

| Pattern | Example | Useful fields |
|---------|---------|---------------|
| mos.ru notification | `…идентификатор： NNNNNNNN Заголовок обращения.pdf` | mos_id, title |
| agency letter | `01-05-7893-26 Сидорчику И.А..pdf` | outgoing ref only; use PDF body |
| scan | `SCN_YYYYMMDD_HHMMSS.pdf` | use PDF body + render |

## Topic keywords (non-exhaustive)

| Topic in response/request | Keywords |
|---------------------------|----------|
| Bus lane | выделенн*, полос* для общественного транспорта, маршрутн* транспорт* |
| Pedestrian crossing | пешеходн* переход*, зебр* |
| SIM parking/marking | разметк*, СИМ, самокат*, парковк* |
| Cycle infrastructure | велодорог*, велополос*, велопереезд*, велоинфраструктур* |
| Transit interval | интервал*, расписан*, маршрут* |

## Location keywords (non-exhaustive)

Extract and compare normalized fragments:

- Street names: Анохина, Верескова*, Дежнёва, Заповедн*, Живописн*, Кольская, etc.
- Metro: Тропарёво, Бабушкинская, Юго-Западная
- Landmarks: ОРП, конечн* «Тропарёво», Живописный мост
