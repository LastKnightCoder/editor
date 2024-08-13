window.global ||= window;

// 解决 Mac 上 PDF 解析错误
if (typeof Promise.withResolvers === "undefined") {
    if (window) {
        window.Promise.withResolvers = function () {
            let resolve, reject
            const promise = new Promise((res, rej) => {
                resolve = res
                reject = rej
            })
            return { promise, resolve, reject }
        }
    }
}