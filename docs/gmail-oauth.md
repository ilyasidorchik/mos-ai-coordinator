# Ключи Gmail

Скрипты `/mail-inbox` и `/check-mail-for-sent-requests` читают почту через OAuth. Чужой клиент не подойдёт: каждый заводит своё приложение в Google Cloud на тот Gmail, куда приходят письма Мос-ру и ЦППК.

Нужны три строки в `.env` (пример — [`.env.example`](../.env.example)):

```text
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
```

Приложение остаётся в статусе Testing. Проверка Google для почтовых scope долгая и для своей почты не нужна. В Testing refresh-токен живёт около 7 дней.

## 1. Проект

Откройте [Google Cloud Console](https://console.cloud.google.com/) под этим Gmail и создайте проект. Название любое, например `mos-appeals`.

## 2. Экран согласия

Меню → **Google Auth Platform**. Если платформа ещё не настроена, нажмите **Get started**:

- **App name** — любое, его видно на экране согласия;
- **User support email** и контакт разработчика — ваш адрес;
- **Audience** — **External**.

Не нажимайте **Publish app**. Статус должен остаться **Testing**.

Дальше **Audience** → **Test users** → **Add users** → тот же Gmail. В Testing согласие может дать только он.

**Data Access** → **Add or Remove Scopes**. Добавьте вручную:

- `https://www.googleapis.com/auth/gmail.modify`
- `https://www.googleapis.com/auth/gmail.labels`

На экране Google будет написано, что приложение может читать почту и менять ярлыки. Скрипт скачивает ответы и квитанции, помечает письма прочитанными и раскладывает их по ярлыкам. Письма он не отправляет.

## 3. Gmail API

Включите [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com): **Enable**. Без этого обмен кода на токен пройдёт, а чтение писем — нет.

## 4. OAuth-клиент

**Google Auth Platform** → **Clients** → **Create client** → тип **Desktop app**. Дополнительные поля не нужны: для Desktop уже разрешён `http://localhost` с любым портом. Скрипт слушает `http://localhost:44000/oauth2callback`.

Сразу скопируйте **Client ID** и **Client secret**. Секрет показывают один раз. Если окно закрыли — откройте клиент и нажмите **Add secret**, затем скопируйте новый.

## 5. `.env` и refresh-токен

В корне репозитория (нужен Node.js):

```bash
cp .env.example .env
```

Впишите `GMAIL_CLIENT_ID` и `GMAIL_CLIENT_SECRET`. Файл `.env` в git не попадает.

Затем:

```bash
node .codex/skills/mail-inbox/scripts/auth.mjs
```

Откроется браузер. Войдите тем же Gmail, что в Test users. Появится предупреждение, что приложение не проверено: **Дополнительно** → **Перейти на страницу «…» (небезопасно)**. Разрешите доступ.

В терминале будет строка `GMAIL_REFRESH_TOKEN=…`. Вставьте её в `.env`.

Для телефона и веба те же три ключа задайте на [cursor.com](https://cursor.com/) → **Cloud Agents** → **···** → **Secrets** как **Runtime Secret**. В чат и в git их не кладите.

## Когда токен протух

`/mail-inbox` пишет `invalid_grant` — refresh-токен истёк (около 7 дней). Повторите команду из шага 5 и обновите только `GMAIL_REFRESH_TOKEN` в `.env` и в Secrets. Client ID и secret не меняются.

Если скрипт пишет, что refresh-токена нет: отзовите доступ на [myaccount.google.com/permissions](https://myaccount.google.com/permissions) и запустите команду снова.

`redirect_uri_mismatch` значит, что клиент создан как **Web application**, а не **Desktop**. Создайте клиент типа Desktop заново. Либо у Web-клиента в Authorized redirect URIs добавьте ровно `http://localhost:44000/oauth2callback`.

Если Google не пускает и ссылки «Дополнительно» нет — этот адрес не в Test users, либо приложение опубликовали без проверки. Верните статус Testing и добавьте аккаунт в Test users.
