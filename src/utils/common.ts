/**
 * 创建一个防抖函数，在延迟时间结束后执行函数。
 * 若设定 immediate 为 true，则在首次调用时立即执行函数。
 * 返回一个带有 cancel 方法的函数，支持 Promise 返回值。
 *
 * @template T 被包装的函数类型
 * @param {T} func 要防抖处理的函数
 * @param {number} wait 延迟时间（毫秒）
 * @param {boolean} [immediate=false] 是否在首次触发时立即执行一次
 * @returns {{
 *   (...args: Parameters<T>): Promise<ReturnType<T>>;
 *   cancel: () => void;
 * }} 防抖后的函数，带有 cancel 方法
 *
 * @example
 * const debouncedFn = debounce((msg) => console.log(msg), 300);
 * debouncedFn('hello').then(() => console.log('done'));
 *
 * // 取消未触发的执行
 * debouncedFn.cancel();
 */

export function debounce<T extends (...args: any[]) => any>(func: T, wait: number, immediate = false) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolveList: ((value: ReturnType<T>) => void)[] = [];

  const debounced = (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise<ReturnType<T>>(resolve => {
      if (timer) clearTimeout(timer);
      resolveList.push(resolve);

      const callNow = immediate && !timer;

      timer = setTimeout(() => {
        if (!immediate) {
          const result = func(...args) as ReturnType<T>;
          resolveList.forEach(r => r(result));
        }
        timer = null;
        resolveList = [];
      }, wait);

      if (callNow) {
        const result = func(...args) as ReturnType<T>;
        resolveList.forEach(r => r(result));
        resolveList = [];
      }
    });
  };

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    resolveList = [];
  };

  return debounced;
}

/**
 * 创建一个节流函数，确保函数在指定间隔时间内最多执行一次。
 * 支持 leading（立即执行）和 trailing（间隔结束后再执行）配置。
 * 返回一个带有 cancel 方法的函数，支持 Promise 返回值。
 *
 * @template T 被包装的函数类型
 * @param {T} func 要节流处理的函数
 * @param {number} wait 最小触发间隔时间（毫秒）
 * @param {boolean} [leading=true] 是否在开始时立即执行一次
 * @param {boolean} [trailing=true] 是否在间隔结束后再执行一次
 * @returns {{
 *   (...args: Parameters<T>): Promise<ReturnType<T>>;
 *   cancel: () => void;
 * }} 节流后的函数，带有 cancel 方法
 *
 * @example
 * const throttledFn = throttle((msg) => console.log(msg), 500);
 * throttledFn('hello').then(() => console.log('done'));
 *
 * // 取消未执行的 trailing 调用
 * throttledFn.cancel();
 */
export function throttle<T extends (...args: any[]) => any>(func: T, wait: number, leading = true, trailing = true) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastCallTime = 0;
  let resolveList: ((value: ReturnType<T>) => void)[] = [];

  const throttled = (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise<ReturnType<T>>(resolve => {
      const now = Date.now();
      const remaining = wait - (now - lastCallTime);

      lastArgs = args;
      resolveList.push(resolve);

      if (!lastCallTime && !leading) {
        lastCallTime = now;
      }

      if (remaining <= 0 || remaining > wait) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        lastCallTime = now;
        const result = func(...lastArgs) as ReturnType<T>;
        resolveList.forEach(r => r(result));
        resolveList = [];
      } else if (!timer && trailing) {
        timer = setTimeout(() => {
          lastCallTime = leading ? Date.now() : 0;
          timer = null;
          const result = func(...(lastArgs as Parameters<T>)) as ReturnType<T>;
          resolveList.forEach(r => r(result));
          resolveList = [];
        }, remaining);
      }
    });
  };

  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    lastArgs = null;
    resolveList = [];
  };

  return throttled;
}
