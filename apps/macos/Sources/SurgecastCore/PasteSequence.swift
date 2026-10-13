/// Holds rapid paste requests until the target has consumed the previous item.
public struct PasteSequence<Item> {
  private var items: [Item]
  private var pending = 0
  public init(_ items: [Item] = []) { self.items = items }
  public var next: Item? { items.first }
  public var isFinished: Bool { items.isEmpty }

  public mutating func request() -> Item? {
    guard pending < items.count else { return nil }
    pending += 1
    return pending == 1 ? items.first : nil
  }

  public mutating func complete() -> Item? {
    guard pending > 0, !items.isEmpty else { return nil }
    items.removeFirst()
    pending -= 1
    return pending > 0 ? items.first : nil
  }
}
