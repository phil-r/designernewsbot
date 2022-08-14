export const development = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined;
export const TELEGRAM_CHANNEL = development ? '@designer_news_st' : '@designer_news';