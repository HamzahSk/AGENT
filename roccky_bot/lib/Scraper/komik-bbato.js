
import * as cheerio from 'cheerio';
import { Scrap } from '#scrap'

const url = 'https://bbato.com';

Scrap.batoPopuler = async () => {
    const res = await fetch (url)
    const data = await res.text()
    return data
}