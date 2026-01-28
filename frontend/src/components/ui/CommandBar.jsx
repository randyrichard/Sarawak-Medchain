import { useState, useEffect, useCallback } from 'react';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * CommandBar - Command palette (Cmd+K / Ctrl+K) for quick actions
 *
 * @param {boolean} open - Controls visibility (optional, can be controlled internally)
 * @param {function} onOpenChange - Called when open state changes
 * @param {Array} commands - Array of command objects
 * @param {Array} recentCommands - Array of recent command IDs
 * @param {function} onCommandExecute - Called when a command is executed
 */
export default function CommandBar({
  open: controlledOpen,
  onOpenChange,
  commands = [],
  recentCommands = [],
  onCommandExecute,
  placeholder = 'Search commands, hospitals, or actions...',
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Support both controlled and uncontrolled modes
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  // Keyboard shortcut to open
  useEffect(() => {
    const down = (e) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || e.key === '/') {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [isOpen, setIsOpen]);

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  // Execute command
  const executeCommand = useCallback((command) => {
    if (command.action) {
      command.action();
    }
    if (onCommandExecute) {
      onCommandExecute(command);
    }
    setIsOpen(false);
  }, [onCommandExecute, setIsOpen]);

  // Default commands if none provided
  const defaultCommands = [
    {
      id: 'export-pdf',
      label: 'Export Investor Deck PDF',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      group: 'Actions',
      shortcut: ['Cmd', 'E'],
    },
    {
      id: 'toggle-automation',
      label: 'Toggle AI Assistant',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
      group: 'Automation',
    },
    {
      id: 'system-status',
      label: 'Check System Status',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      group: 'System',
    },
    {
      id: 'view-nodes',
      label: 'View Node Health',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      ),
      group: 'System',
    },
    {
      id: 'generate-invoice',
      label: 'Generate Invoice',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
        </svg>
      ),
      group: 'Actions',
    },
    {
      id: 'broadcast-message',
      label: 'Broadcast Message',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
        </svg>
      ),
      group: 'Actions',
    },
  ];

  const allCommands = commands.length > 0 ? commands : defaultCommands;

  // Group commands
  const groupedCommands = allCommands.reduce((acc, cmd) => {
    const group = cmd.group || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push(cmd);
    return acc;
  }, {});

  // Recent commands
  const recent = recentCommands
    .map(id => allCommands.find(c => c.id === id))
    .filter(Boolean)
    .slice(0, 3);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Command Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 z-[301] w-full max-w-xl"
          >
            <Command
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(15, 23, 42, 0.98)',
                border: '1px solid rgba(20, 184, 166, 0.3)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 60px rgba(20, 184, 166, 0.1)',
                backdropFilter: 'blur(20px)',
              }}
            >
              {/* Search Input */}
              <div
                className="flex items-center px-4 border-b"
                style={{ borderColor: 'rgba(30, 58, 95, 0.5)' }}
              >
                <svg
                  className="w-5 h-5 mr-3"
                  fill="none"
                  stroke="#64748b"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder={placeholder}
                  className="flex-1 py-4 bg-transparent text-white placeholder-slate-500 outline-none text-base"
                />
                <kbd
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-mono text-slate-500 bg-slate-800 rounded"
                >
                  ESC
                </kbd>
              </div>

              {/* Command List */}
              <Command.List className="max-h-80 overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center text-slate-500 text-sm">
                  No commands found. Try a different search.
                </Command.Empty>

                {/* Recent Commands */}
                {recent.length > 0 && !search && (
                  <Command.Group
                    heading={
                      <span className="px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Recent
                      </span>
                    }
                    className="mb-2"
                  >
                    {recent.map((cmd) => (
                      <CommandItem
                        key={cmd.id}
                        command={cmd}
                        onSelect={() => executeCommand(cmd)}
                      />
                    ))}
                  </Command.Group>
                )}

                {/* Grouped Commands */}
                {Object.entries(groupedCommands).map(([group, cmds]) => (
                  <Command.Group
                    key={group}
                    heading={
                      <span className="px-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {group}
                      </span>
                    }
                    className="mb-2"
                  >
                    {cmds.map((cmd) => (
                      <CommandItem
                        key={cmd.id}
                        command={cmd}
                        onSelect={() => executeCommand(cmd)}
                      />
                    ))}
                  </Command.Group>
                ))}
              </Command.List>

              {/* Footer */}
              <div
                className="flex items-center justify-between px-4 py-3 border-t text-xs text-slate-500"
                style={{ borderColor: 'rgba(30, 58, 95, 0.5)' }}
              >
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Enter</kbd>
                    to select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">Esc</kbd>
                    to close
                  </span>
                </div>
                <span className="text-slate-600">Founder Command</span>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Individual command item
function CommandItem({ command, onSelect }) {
  return (
    <Command.Item
      value={command.label}
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group"
      style={{
        color: '#e2e8f0',
      }}
    >
      {command.icon && (
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{
            backgroundColor: 'rgba(20, 184, 166, 0.1)',
            border: '1px solid rgba(20, 184, 166, 0.2)',
            color: '#14b8a6',
          }}
        >
          {command.icon}
        </span>
      )}
      <div className="flex-1">
        <p className="text-sm font-medium">{command.label}</p>
        {command.description && (
          <p className="text-xs text-slate-500">{command.description}</p>
        )}
      </div>
      {command.shortcut && (
        <div className="flex items-center gap-1">
          {command.shortcut.map((key, i) => (
            <kbd
              key={i}
              className="px-1.5 py-0.5 text-xs bg-slate-800 rounded text-slate-400"
            >
              {key}
            </kbd>
          ))}
        </div>
      )}
    </Command.Item>
  );
}

// CSS for cmdk integration (add to your CSS file)
export const commandBarStyles = `
[cmdk-group-heading] {
  padding: 8px 8px 4px;
}

[cmdk-item] {
  content-visibility: auto;
}

[cmdk-item][data-selected='true'] {
  background: rgba(20, 184, 166, 0.1);
}

[cmdk-item][data-selected='true'] span {
  background: rgba(20, 184, 166, 0.2) !important;
  border-color: rgba(20, 184, 166, 0.4) !important;
}

[cmdk-item]:active {
  transition-property: background;
  background: rgba(20, 184, 166, 0.15);
}

[cmdk-list] {
  scroll-padding-block-start: 8px;
  scroll-padding-block-end: 8px;
}

[cmdk-list]::-webkit-scrollbar {
  width: 6px;
}

[cmdk-list]::-webkit-scrollbar-track {
  background: transparent;
}

[cmdk-list]::-webkit-scrollbar-thumb {
  background: rgba(20, 184, 166, 0.3);
  border-radius: 3px;
}
`;
