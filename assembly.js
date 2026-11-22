const objectSearch = {
  book: {
    aliases: ['книги', 'учебник', 'литература'],
    tags: ['книг', 'чита', 'чтен', 'учеб', 'учебник', 'знан', 'библиотек', 'истори'],
  },
  phone: {
    aliases: ['телефоны', 'смартфон', 'мобильный телефон'],
    tags: ['телефон', 'смартфон', 'экран', 'цифров', 'приложен', 'звон', 'связ', 'сообщен'],
  },
  puzzle: {
    aliases: ['пазл', 'головоломка'],
    tags: ['пазл', 'головолом', 'собер', 'собир', 'решен', 'логик', 'детал', 'иде'],
  },
  coin: {
    aliases: ['монеты', 'монетка', 'монетки'],
    tags: ['монет', 'финанс', 'бюджет', 'деньг', 'эконом', 'доход', 'сбереж', 'платеж'],
  },
  headphones: {
    aliases: ['наушник', 'гарнитура'],
    tags: ['наушник', 'гарнитур', 'музык', 'слуша', 'аудио', 'звук', 'подкаст', 'тишин', 'тиш', 'фокус'],
  },
  lamp: {
    aliases: ['лампы', 'светильник', 'настольная лампа'],
    tags: ['ламп', 'свет', 'вечер', 'ноч', 'озарен', 'вдохнов', 'сосредоточ', 'учеб'],
  },
  flowers: {
    aliases: ['цветок', 'букет', 'ваза', 'цветы в вазе'],
    tags: ['цветок', 'цветы', 'цветен', 'цветоч', 'букет', 'ваз', 'весн', 'сад', 'природ', 'рост'],
  },
  wallet: {
    aliases: ['кошельки', 'портмоне', 'бумажник'],
    tags: ['кошел', 'портмон', 'бумажник', 'деньг', 'бюджет', 'покуп', 'сбереж', 'финанс'],
  },
  folder: {
    aliases: ['папки', 'папка для документов'],
    tags: ['папк', 'документ', 'архив', 'файл', 'офис', 'поряд', 'проект', 'организац'],
  },
  pen: {
    aliases: ['ручки', 'шариковая ручка', 'авторучка'],
    tags: ['ручк', 'авторучк', 'писа', 'письм', 'замет', 'чернов', 'учеб', 'творч', 'запис', 'иде'],
  },
};

function searchWords(text) {
  return text.toLocaleLowerCase('ru').replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function normalizedName(text) {
  return searchWords(text).join(' ');
}

function matchObjectsByNames(query, library) {
  const byName = new Map();
  for (const [key, entry] of Object.entries(library)) {
    for (const name of [entry.name, ...(objectSearch[key]?.aliases ?? [])]) {
      byName.set(normalizedName(name), key);
    }
  }
  const keys = new Set();
  const unknown = new Set();
  const names = query.split(/[,;\n]+/).map(name => name.trim()).filter(Boolean);
  for (const name of names) {
    const key = byName.get(normalizedName(name));
    if (key) keys.add(key);
    else unknown.add(name);
  }
  return { keys: [...keys], unknown: [...unknown] };
}

function matchObjectsByIdea(query, library) {
  const words = [...new Set(searchWords(query))];
  return Object.entries(library)
    .map(([key, entry]) => {
      const name = normalizedName(entry.name);
      const tags = objectSearch[key]?.tags ?? [];
      const score = words.reduce((sum, word) => {
        if (word === name) return sum + 4;
        return sum + Number(tags.some(tag => word.startsWith(tag)));
      }, 0);
      return { key, score };
    })
    .filter(result => result.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, 3)
    .map(result => result.key);
}
