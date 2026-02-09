const t = (key: string) => key;

const title = t("app.title");
const missing = t("missing.key");
const literal = "app.title";
console.log(title, missing, literal);
