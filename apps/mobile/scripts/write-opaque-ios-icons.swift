import CoreGraphics
import Foundation
import ImageIO

let arguments = Array(CommandLine.arguments.dropFirst())
guard arguments.count >= 3 else {
    throw NSError(domain: "需要来源目录、目标目录和图标文件名", code: 1)
}

for filename in arguments.dropFirst(2) {
    let sourceURL = URL(fileURLWithPath: arguments[0]).appendingPathComponent(filename)
    let targetURL = URL(fileURLWithPath: arguments[1]).appendingPathComponent(filename)
    guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
          let context = CGContext(
              data: nil, width: image.width, height: image.height,
              bitsPerComponent: 8, bytesPerRow: image.width * 4,
              space: CGColorSpace(name: CGColorSpace.sRGB)!,
              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
          ) else {
        throw NSError(domain: "无法读取 iOS 图标：\(filename)", code: 1)
    }

    // 按现有 iOS 白色底图合成，保证缩放产生的半透明像素也不进入 App Store 图标。
    let bounds = CGRect(x: 0, y: 0, width: image.width, height: image.height)
    context.setFillColor(CGColor(gray: 1, alpha: 1))
    context.fill(bounds)
    context.draw(image, in: bounds)
    guard let opaqueImage = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(targetURL as CFURL, "public.png" as CFString, 1, nil) else {
        throw NSError(domain: "无法写入 iOS 图标：\(filename)", code: 1)
    }
    CGImageDestinationAddImage(destination, opaqueImage, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw NSError(domain: "保存 iOS 图标失败：\(filename)", code: 1)
    }
}
