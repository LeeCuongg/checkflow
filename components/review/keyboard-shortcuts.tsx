interface ShortcutAction {
  label: string
  keyLabel: string
}

interface KeyboardShortcutsProps {
  // Rows of the "Primary Actions" group. Default: Confirm (1).
  primaryActions?: ShortcutAction[]
  // Noun in "Next …" / "Previous …". Default: "Order".
  itemNoun?: string
  // Rows that only exist on the order review modal. Default: shown.
  showCopyItemId?: boolean
  showCustomerTab?: boolean
  showOtherActions?: boolean
}

const DEFAULT_PRIMARY_ACTIONS: ShortcutAction[] = [{ label: "Confirm", keyLabel: "1" }]

export function KeyboardShortcuts({
  primaryActions = DEFAULT_PRIMARY_ACTIONS,
  itemNoun = "Order",
  showCopyItemId = true,
  showCustomerTab = true,
  showOtherActions = true,
}: KeyboardShortcutsProps = {}) {
  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-3 border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Keyboard Shortcuts</h4>
      </div>

      <div className="space-y-2">
        {/* Primary Actions */}
        <div className="space-y-1">
          {primaryActions.map((action) => (
            <div key={action.label} className="flex items-center justify-between">
              <span className="text-xs text-slate-600">{action.label}</span>
              <kbd className="px-2 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">
                {action.keyLabel}
              </kbd>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 pt-2">
          {/* Navigation */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Next {itemNoun}</span>
              <kbd className="px-2 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">
                Space
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Previous {itemNoun}</span>
              <div className="flex gap-1">
                <kbd className="px-1.5 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">
                  Shift
                </kbd>
                <span className="text-xs text-slate-400">+</span>
                <kbd className="px-2 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">
                  Space
                </kbd>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-2">
          {/* Image Controls */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Rotate Image</span>
              <kbd className="px-2 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">R</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Fullscreen</span>
              <kbd className="px-2 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">F</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Copy Screenshot</span>
              <kbd className="px-2 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">S</kbd>
            </div>
            {showCopyItemId && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Copy Item ID</span>
                <kbd className="px-2 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">A</kbd>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-2">
          {/* Tab Navigation */}
          <div className="text-xs text-slate-500 mb-1 font-medium">Image Tabs:</div>
          <div className="grid grid-cols-2 gap-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Mockup</span>
              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">
                M
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Design</span>
              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">
                D
              </kbd>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Product</span>
              <kbd className="px-1.5 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">
                P
              </kbd>
            </div>
            {showCustomerTab && (
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Customer</span>
                <kbd className="px-1.5 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">
                  I
                </kbd>
              </div>
            )}
          </div>
        </div>

        {showOtherActions && (
          <div className="border-t border-slate-200 pt-2">
            {/* Other Actions */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">View Mode</span>
                <kbd className="px-2 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">V</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">History</span>
                <kbd className="px-2 py-0.5 text-xs font-mono bg-white border border-slate-300 rounded shadow-sm">H</kbd>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
