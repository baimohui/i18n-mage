const tunnel = require("tunnel");
const { translate } = require("@vitalets/google-translate-api");

const translateTo = async ({ source, target, sourceTextList }) => {
  const translateLenLimit = 5000;
  const secondRequestLimit = 1;
  let sum = 0;
  let pack = [];
  const packList = [];
  sourceTextList.forEach(text => {
    sum += text.length;
    if (text.length > translateLenLimit) {
      return { success: false, message: `文本字符数超出单次翻译请求限制：${text}` };
    }
    if (sum > translateLenLimit) {
      packList.push(pack);
      pack = [];
      sum = text.length;
    }
    pack.push(text);
  });
  packList.push(pack);
  return await sendBatch(source, target, packList, 0, secondRequestLimit);
};

const sendBatch = async (source, target, packList, batchNum, batchSize) => {
  const result = { success: true, message: "", data: [] };
  const packNum = batchNum * batchSize;
  for (let i = packNum; i < packNum + batchSize; i++) {
    if (packList[i] === undefined) {
      break;
    }
    const res = await send(source, target, packList[i]);
    if (!res.success) {
      return res;
    }
    result.data.push(...res.data);
  }
  if (packList.length > packNum + batchSize) {
    return new Promise(resolve => {
      setTimeout(async () => {
        const batchRes = await sendBatch(source, target, packList, batchNum + 1, batchSize);
        if (batchRes.success) {
          result.data.push(...batchRes.data);
          resolve(result);
        } else {
          resolve(batchRes)
        }
      }, 1100);
    });
  } else {
    return result;
  }
};

const send = async (source, target, sourceTextList) => {
  const sourceText = sourceTextList.join("\n");
  const res = await translate(sourceText, {
    from: source,
    to: target,
    fetchOptions: {
      agent: tunnel.httpsOverHttp({
        proxy: {
          port: 7890,
          host: "127.0.0.1",
          headers: {
            "User-Agent": "Node"
          }
        }
      })
    }
  }).catch(e => {
    return { success: false, message: e.message };
  });
  if (res.text) {
    const transformedList = [];
    // const resList = data.raw.sentences.map(item => item.orig);
    const resList = res.text.split("\n");
    let curResIndex = 0;
    sourceTextList.forEach(text => {
      const newlineCount = (text.match(/\n/g) || []).length + 1;
      transformedList.push(resList.slice(curResIndex, curResIndex + newlineCount).join("\n"));
      curResIndex += newlineCount;
    });
    return { success: true, data: transformedList };
  } else {
    return { success: false, message: res.message };
  }
};

module.exports = translateTo;
