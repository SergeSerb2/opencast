import CoreGraphics
import Foundation

public enum Geometry {
  public static func ax(_ rect: CGRect, desktopTop: CGFloat) -> CGRect {
    CGRect(x: rect.minX, y: desktopTop - rect.maxY, width: rect.width, height: rect.height)
  }
  public static func cocoa(_ rect: CGRect, desktopTop: CGFloat) -> CGRect {
    ax(rect, desktopTop: desktopTop)
  }
  public static func layout(_ fraction: CGRect, screen: CGRect, gap: CGFloat = 0) -> CGRect {
    CGRect(
      x: screen.minX + screen.width * fraction.minX, y: screen.maxY - screen.height * fraction.maxY,
      width: screen.width * fraction.width, height: screen.height * fraction.height
    ).insetBy(dx: gap, dy: gap)
  }
  public static func moved(_ rect: CGRect, from: CGRect, to: CGRect) -> CGRect {
    CGRect(
      x: to.minX + (rect.minX - from.minX) / from.width * to.width,
      y: to.minY + (rect.minY - from.minY) / from.height * to.height,
      width: rect.width / from.width * to.width, height: rect.height / from.height * to.height)
  }
  public static func fraction(_ command: String) -> CGRect? {
    let full = CGRect(x: 0, y: 0, width: 1, height: 1)
    switch command {
    case "maximize": return full
    case "maximizeAlmost": return full.insetBy(dx: 0.025, dy: 0.025)
    case "leftHalf": return CGRect(x: 0, y: 0, width: 0.5, height: 1)
    case "rightHalf": return CGRect(x: 0.5, y: 0, width: 0.5, height: 1)
    case "topHalf": return CGRect(x: 0, y: 0, width: 1, height: 0.5)
    case "bottomHalf": return CGRect(x: 0, y: 0.5, width: 1, height: 0.5)
    case "centerHalf": return CGRect(x: 0.25, y: 0, width: 0.5, height: 1)
    default: break
    }
    let horizontal: [(String, CGFloat, CGFloat)] = [
      ("firstThird", 0, 1 / 3), ("centerThird", 1 / 3, 1 / 3), ("lastThird", 2 / 3, 1 / 3),
      ("firstTwoThird", 0, 2 / 3), ("centerTwoThird", 1 / 6, 2 / 3), ("lastTwoThird", 1 / 3, 2 / 3),
      ("firstThreeFourth", 0, 0.75), ("centerThreeFourth", 0.125, 0.75),
      ("lastThreeFourth", 0.25, 0.75), ("firstFourth", 0, 0.25), ("secondFourth", 0.25, 0.25),
      ("thirdFourth", 0.5, 0.25), ("lastFourth", 0.75, 0.25),
    ]
    if let v = horizontal.first(where: { $0.0 == command }) {
      return CGRect(x: v.1, y: 0, width: v.2, height: 1)
    }
    let vertical: [(String, CGFloat, CGFloat)] = [
      ("topThird", 0, 1 / 3), ("middleThird", 1 / 3, 1 / 3), ("bottomThird", 2 / 3, 1 / 3),
      ("topTwoThird", 0, 2 / 3), ("bottomTwoThird", 1 / 3, 2 / 3), ("topFirstFourth", 0, 0.25),
      ("topSecondFourth", 0.25, 0.25), ("topThirdFourth", 0.5, 0.25), ("topLastFourth", 0.75, 0.25),
      ("topThreeFourth", 0, 0.75), ("bottomThreeFourth", 0.25, 0.75),
    ]
    if let v = vertical.first(where: { $0.0 == command }) {
      return CGRect(x: 0, y: v.1, width: 1, height: v.2)
    }
    if command == "topCenterTwoThird" || command == "bottomCenterTwoThird" {
      return CGRect(x: 1 / 6, y: command.hasPrefix("top") ? 0 : 0.5, width: 2 / 3, height: 0.5)
    }
    let columns = ["Left": CGFloat(0), "Center": CGFloat(1 / 3), "Right": CGFloat(2 / 3)]
    for (name, x) in columns {
      for (row, y) in [("top", CGFloat(0)), ("bottom", CGFloat(0.5))] {
        if command == "\(row)\(name)Sixth" { return CGRect(x: x, y: y, width: 1 / 3, height: 0.5) }
      }
    }
    for (name, x) in [("Left", CGFloat(0)), ("Right", CGFloat(0.5))] {
      for (row, y) in [("top", CGFloat(0)), ("bottom", CGFloat(0.5))] {
        if command == "\(row)\(name)Quarter" { return CGRect(x: x, y: y, width: 0.5, height: 0.5) }
      }
    }
    return nil
  }
}
