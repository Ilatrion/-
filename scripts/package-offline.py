from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

output = Path('pages')
with ZipFile(output / 'HotelManager-Offline.zip', 'w', ZIP_DEFLATED) as archive:
    archive.write(output / 'index.html', 'HotelManager-Offline/index.html')
    archive.writestr('HotelManager-Offline/README.txt', '''HotelManager — автономная версия

1. Распакуйте архив в обычную папку.
2. Откройте index.html двойным щелчком в Chrome или Edge.
3. При первом запуске придумайте пароль администратора (от 12 символов).
4. Логин администратора: admin. После входа создайте PIN и сохраните код восстановления.
5. Для гостевого кабинета выйдите и зарегистрируйте гостевой аккаунт.

Node.js, отдельный сервер и интернет для этого файла не нужны.
Все данные сохраняются в этом браузере. На другом компьютере будет другая база.
Не очищайте данные браузера, если хотите сохранить работу.
Для проверки уведомлений гостя и администратора используйте один браузер.
''')
    archive.write('docs/third-party.md', 'HotelManager-Offline/third-party.md')
    archive.write('docs/photo-credits.md', 'HotelManager-Offline/photo-credits.md')
print(output / 'HotelManager-Offline.zip')
