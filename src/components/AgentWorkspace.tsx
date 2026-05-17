import { useEffect, useMemo, useState, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { AgentConversation, AgentMessage, AgentRound, TaskRecord } from '../types'
import { editOutputs, getActiveAgentRounds, getAgentBranchLeafId, getAgentSiblingRounds, getCachedImage, ensureImageCached, removeMultipleTasks, removeTask, reuseConfig, updateTaskInStore, useStore } from '../store'
import { getPromptMentionParts } from '../lib/promptImageMentions'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import TaskCard from './TaskCard'
import ViewportTooltip from './ViewportTooltip'
import MarkdownRenderer from './MarkdownRenderer'
import { TrashIcon, DownloadIcon, EditIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, SidebarLeftIcon, FavoriteIcon, CloseIcon, CopyIcon } from './icons'

function AgentActionButton({
  tooltip,
  className,
  disabled = false,
  onClick,
  children,
}: {
  tooltip: string
  className: string
  disabled?: boolean
  onClick?: (e: ReactMouseEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false)

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
      onFocus={() => setTooltipVisible(true)}
      onBlur={() => setTooltipVisible(false)}
    >
      <button
        type="button"
        className={className}
        disabled={disabled}
        aria-label={tooltip}
        onClick={onClick}
      >
        {children}
      </button>
      <ViewportTooltip visible={tooltipVisible} className="whitespace-nowrap">
        {tooltip}
      </ViewportTooltip>
    </span>
  )
}

function ChatImageThumb({ imageId }: { imageId: string }) {
  const [src, setSrc] = useState<string>(() => getCachedImage(imageId) || '')
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)

  useEffect(() => {
    if (src) return
    let cancelled = false
    ensureImageCached(imageId).then((url) => {
      if (!cancelled && url) setSrc(url)
    })
    return () => { cancelled = true }
  }, [imageId, src])

  return (
    <div 
      className="w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-gray-200 dark:border-white/[0.08] cursor-pointer hover:opacity-80 transition-opacity"
      onClick={() => setLightboxImageId(imageId, [imageId])}
    >
      {src ? <img src={src} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-gray-100 dark:bg-white/[0.04]" />}
    </div>
  )
}

function AgentStreamingCursor() {
  return (
    <span
      aria-label="正在生成"
      className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500 align-baseline dark:bg-blue-400"
    />
  )
}

function formatTime(value: number) {
  return new Date(value).toLocaleString()
}

function getConversationSearchText(conversation: AgentConversation) {
  return [
    conversation.title,
    ...conversation.messages.map((message) => message.content),
    ...conversation.rounds.map((round) => round.prompt),
  ].join('\n').toLocaleLowerCase()
}

function getRoundTasks(round: AgentRound | null, tasks: TaskRecord[]) {
  if (!round) return []
  return round.outputTaskIds.map((taskId) => tasks.find((task) => task.id === taskId) ?? null)
}

const MOBILE_HEADER_PULL_THRESHOLD = 24
const MOBILE_HEADER_PULL_MAX_OFFSET = 48
const MOBILE_HEADER_EDGE_GUARD = 24

function getPageScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
}

export default function AgentWorkspace() {
  const conversations = useStore((s) => s.agentConversations)
  const activeConversationId = useStore((s) => s.activeAgentConversationId)
  const createConversation = useStore((s) => s.createAgentConversation)
  const setActiveConversationId = useStore((s) => s.setActiveAgentConversationId)
  const renameConversation = useStore((s) => s.renameAgentConversation)
  const deleteConversation = useStore((s) => s.deleteAgentConversation)
  const sidebarCollapsed = useStore((s) => s.agentSidebarCollapsed)
  const setSidebarCollapsed = useStore((s) => s.setAgentSidebarCollapsed)
  const agentMobileHeaderVisible = useStore((s) => s.agentMobileHeaderVisible)
  const setAgentMobileHeaderVisible = useStore((s) => s.setAgentMobileHeaderVisible)
  const appMode = useStore((s) => s.appMode)
  const tasks = useStore((s) => s.tasks)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setPrompt = useStore((s) => s.setPrompt)
  const setInputImages = useStore((s) => s.setInputImages)
  const clearMaskDraft = useStore((s) => s.clearMaskDraft)
  const setAppMode = useStore((s) => s.setAppMode)
  const agentEditingRoundId = useStore((s) => s.agentEditingRoundId)
  const setAgentEditingRoundId = useStore((s) => s.setAgentEditingRoundId)
  const setActiveAgentRoundId = useStore((s) => s.setActiveAgentRoundId)
  const showToast = useStore((s) => s.showToast)
  const agentGeneratingTitleIds = useStore((s) => s.agentGeneratingTitleIds)
  const conversation = conversations.find((item) => item.id === activeConversationId) ?? null
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef(new Map<string, HTMLElement>())
  const [scrollTargetRoundId, setScrollTargetRoundId] = useState<string | null>(null)
  const [pullDownOffset, setPullDownOffset] = useState(0)
  const [mobileTopBarVisible, setMobileTopBarVisible] = useState(true)
  const [conversationSearchQuery, setConversationSearchQuery] = useState('')
  const [conversationActionsId, setConversationActionsId] = useState<string | null>(null)
  const touchStartY = useRef(-1)
  const conversationLongPressTimer = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    const touchY = e.touches[0]?.clientY ?? -1
    if (
      appMode !== 'agent' ||
      agentMobileHeaderVisible ||
      getPageScrollTop() > 0 ||
      touchY < MOBILE_HEADER_EDGE_GUARD
    ) {
      touchStartY.current = -1
      setPullDownOffset(0)
      return
    }

    touchStartY.current = touchY
  }

  const handleHeaderTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }
   
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current <= 0 || agentMobileHeaderVisible) return

    const diff = e.touches[0].clientY - touchStartY.current
    if (diff <= 0) {
      setPullDownOffset(0)
      return
    }

    if (e.cancelable) e.preventDefault()
    if (diff >= MOBILE_HEADER_PULL_THRESHOLD) {
      setAgentMobileHeaderVisible(true)
      setPullDownOffset(0)
      touchStartY.current = -1
      return
    }

    setPullDownOffset(Math.min(diff, MOBILE_HEADER_PULL_MAX_OFFSET))
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current > 0 && !agentMobileHeaderVisible) {
      const touchEndY = e.changedTouches[0].clientY
      if (touchEndY - touchStartY.current >= MOBILE_HEADER_PULL_THRESHOLD) setAgentMobileHeaderVisible(true)
    }
    setPullDownOffset(0)
    touchStartY.current = -1
  }

  useEffect(() => {
    if (appMode !== 'agent') return

    document.documentElement.classList.add('agent-no-pull-refresh')
    return () => document.documentElement.classList.remove('agent-no-pull-refresh')
  }, [appMode])

  useEffect(() => {
    if (!agentMobileHeaderVisible || appMode !== 'agent') return

    const handleInteract = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('header[data-no-drag-select]')) return
      setAgentMobileHeaderVisible(false)
    }

    document.addEventListener('mousedown', handleInteract, { capture: true })
    document.addEventListener('touchstart', handleInteract, { capture: true })

    return () => {
      document.removeEventListener('mousedown', handleInteract, { capture: true })
      document.removeEventListener('touchstart', handleInteract, { capture: true })
    }
  }, [agentMobileHeaderVisible, appMode, setAgentMobileHeaderVisible])

  useEffect(() => {
    if (appMode !== 'agent') return

    setMobileTopBarVisible(true)
    let lastScrollY = window.scrollY
    let ticking = false

    const handleScroll = () => {
      if (ticking) return

      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY
        if (currentScrollY < 20) {
          setMobileTopBarVisible(true)
        } else if (currentScrollY > lastScrollY + 10) {
          setMobileTopBarVisible(false)
        } else if (currentScrollY < lastScrollY - 10) {
          setMobileTopBarVisible(true)
        }
        lastScrollY = currentScrollY
        ticking = false
      })
      ticking = true
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [appMode])

  useEffect(() => {
    if (appMode !== 'agent') return
    
    if (conversations.length === 0) {
      createConversation()
    } else if (!conversation) {
      const latest = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (latest && latest.messages.length === 0) {
        setActiveConversationId(latest.id)
      } else {
        createConversation()
      }
    }
  }, [appMode, conversations, conversation, createConversation, setActiveConversationId])

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  )

  const filteredConversations = useMemo(() => {
    const query = conversationSearchQuery.trim().toLocaleLowerCase()
    if (!query) return sortedConversations
    return sortedConversations.filter((item) => getConversationSearchText(item).includes(query))
  }, [conversationSearchQuery, sortedConversations])

  const activeRounds = useMemo(
    () => conversation ? getActiveAgentRounds(conversation) : [],
    [conversation],
  )

  const activeMessages = useMemo(() => {
    if (!conversation) return []
    const messages: AgentMessage[] = []
    for (const round of activeRounds) {
      const userMessage = conversation.messages.find((message) => message.id === round.userMessageId)
      if (userMessage) messages.push(userMessage)
      const assistantMessage = round.assistantMessageId
        ? conversation.messages.find((message) => message.id === round.assistantMessageId)
        : conversation.messages.find((message) => message.roundId === round.id && message.role === 'assistant')
      if (assistantMessage) messages.push(assistantMessage)
    }
    return messages
  }, [activeRounds, conversation])

  useEffect(() => {
    if (!scrollTargetRoundId) return
    const id = window.requestAnimationFrame(() => {
      messageRefs.current.get(scrollTargetRoundId)?.scrollIntoView({ block: 'center' })
      setScrollTargetRoundId(null)
    })
    return () => window.cancelAnimationFrame(id)
  }, [activeMessages, scrollTargetRoundId])

  const handleSwitchBranch = (round: AgentRound, direction: -1 | 1) => {
    if (!conversation) return
    const siblings = getAgentSiblingRounds(conversation, round)
    if (siblings.length <= 1) return
    const currentIndex = siblings.findIndex((item) => item.id === round.id)
    const nextRound = siblings[(currentIndex + direction + siblings.length) % siblings.length]
    const nextLeafId = getAgentBranchLeafId(conversation, nextRound.id)
    setActiveAgentRoundId(conversation.id, nextLeafId)
    setAgentEditingRoundId(null)
    setScrollTargetRoundId(nextRound.id)
  }

  const handleDeleteConversation = (id: string) => {
    setConfirmDialog({
      title: '删除对话',
      message: '确定要删除这个 Agent 对话吗？已同步到画廊的任务记录不会自动删除。',
      action: () => deleteConversation(id),
    })
  }

  const handleRenameConversation = (id: string, currentTitle: string) => {
    if (agentGeneratingTitleIds[id]) {
      showToast('标题生成中，暂不能修改标题', 'info')
      return
    }
    const title = window.prompt('输入新的对话标题', currentTitle)
    if (title != null) renameConversation(id, title)
  }

  const clearConversationLongPressTimer = () => {
    if (conversationLongPressTimer.current == null) return
    window.clearTimeout(conversationLongPressTimer.current)
    conversationLongPressTimer.current = null
  }

  const handleConversationPointerDown = (id: string, e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return
    clearConversationLongPressTimer()
    conversationLongPressTimer.current = window.setTimeout(() => {
      setConversationActionsId(id)
      conversationLongPressTimer.current = null
    }, 450)
  }

  const handleConversationSelect = (id: string) => {
    setActiveConversationId(id)
    if (conversationActionsId && conversationActionsId !== id) setConversationActionsId(null)
  }

  useEffect(() => {
    if (!conversationActionsId) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-agent-conversation-item]')) return
      setConversationActionsId(null)
    }

    document.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => document.removeEventListener('pointerdown', handlePointerDown, { capture: true })
  }, [conversationActionsId])

  const handleDeleteMessage = (message: AgentMessage, round: AgentRound) => {
    const isUserMessage = message.role === 'user'
    setConfirmDialog({
      title: isUserMessage ? '删除轮次' : '删除消息',
      message: isUserMessage
        ? '确定要删除这轮记录吗？这会删除这条消息和它的输出，后续消息会被保留。'
        : '确定要删除这条消息吗？关联的图片任务不会从画廊中删除。',
      action: async () => {
        if (isUserMessage) {
          if (round.outputTaskIds.length > 0) await removeMultipleTasks(round.outputTaskIds)

          useStore.setState((state) => ({
            agentConversations: state.agentConversations.map((item) =>
              item.id === conversation?.id
                ? (() => {
                    const rounds = item.rounds
                      .filter((candidate) => candidate.id !== round.id)
                      .map((candidate) =>
                        candidate.parentRoundId === round.id
                          ? { ...candidate, parentRoundId: round.parentRoundId ?? null }
                          : candidate,
                      )
                    const messages = item.messages.filter((candidate) => candidate.roundId !== round.id)
                    const nextConversation = { ...item, rounds, messages, activeRoundId: item.activeRoundId === round.id ? null : item.activeRoundId ?? null }
                    const activeRounds = getActiveAgentRounds(nextConversation)
                    return {
                      ...nextConversation,
                      activeRoundId: nextConversation.activeRoundId ?? activeRounds[activeRounds.length - 1]?.id ?? null,
                      updatedAt: Date.now(),
                    }
                  })()
                : item,
            ),
            agentEditingRoundId: state.agentEditingRoundId === round.id ? null : state.agentEditingRoundId,
          }))
          return
        }

        useStore.setState((state) => ({
          agentConversations: state.agentConversations.map((item) =>
            item.id === conversation?.id
              ? {
                  ...item,
                  updatedAt: Date.now(),
                  rounds: item.rounds.map((candidate) =>
                    candidate.id === round.id && candidate.assistantMessageId === message.id
                      ? { ...candidate, assistantMessageId: undefined }
                      : candidate,
                  ),
                  messages: item.messages.filter((candidate) => candidate.id !== message.id),
                }
              : item,
          ),
          agentEditingRoundId: state.agentEditingRoundId,
        }))
      },
    })
  }

  const handleReuse = (task: TaskRecord) => {
    setConfirmDialog({
      title: '切换到画廊模式？',
      message: '复用参数会应用到画廊输入区。切换到画廊模式后，当前 Agent 对话仍会保留。',
      confirmText: '切换并复用',
      cancelText: '取消',
      action: () => {
        setAppMode('gallery')
        void reuseConfig(task)
      },
    })
  }

  const handleEditRoundMessage = async (round: AgentRound, content: string) => {
    setAgentEditingRoundId(round.id)
    clearMaskDraft()

    const inputImages = await Promise.all(
      round.inputImageIds.map(async (id) => ({
        id,
        dataUrl: await ensureImageCached(id) || '',
      })),
    )
    setInputImages(inputImages)
    setPrompt(content)
  }

  const handleCopyMessage = async (content: string) => {
    try {
      await copyTextToClipboard(content)
      showToast('提示词已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制提示词失败', err), 'error')
    }
  }

  return (
    <main 
      data-agent-workspace 
      className="safe-area-x mx-auto flex min-h-[calc(100vh-100px)] flex-col lg:flex-row max-w-7xl lg:gap-3 px-3 lg:px-0 relative overflow-visible transition-all duration-300"
    >
      {/* Pull Down Indicator */}
      {pullDownOffset > 0 && !agentMobileHeaderVisible && (
        <div 
          className="fixed top-0 left-0 right-0 z-50 flex justify-center items-end pointer-events-none sm:hidden"
          style={{ height: `${pullDownOffset + 10}px`, opacity: pullDownOffset / MOBILE_HEADER_PULL_MAX_OFFSET }}
        >
          <div className="bg-black/60 backdrop-blur-sm text-white rounded-full p-1 mb-2 shadow-lg">
            <ChevronDownIcon className="w-4 h-4" />
          </div>
        </div>
      )}

      {/* Mobile Left Sidebar Overlay Backdrop */}
      {!sidebarCollapsed && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarCollapsed(true)} />
      )}
      
      {/* Left Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-4/5 max-w-[320px] flex-col border-r border-gray-200 bg-white/95 shadow-2xl backdrop-blur transition-transform duration-300 dark:border-white/[0.08] dark:bg-gray-950/95 lg:hidden ${!sidebarCollapsed ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="pl-[max(1rem,env(safe-area-inset-left))] flex h-full min-h-0 w-full flex-col">
          <div className="safe-area-top shrink-0">
            <div className="flex h-14 items-center justify-between gap-2 px-4">
              <button type="button" onClick={() => setSidebarCollapsed(true)} className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg transition-colors" title="折叠左侧边栏">
                <SidebarLeftIcon className="w-5 h-5" />
              </button>
              <button type="button" onClick={createConversation} className="p-2 -mr-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 lg:hover:bg-gray-100 lg:dark:hover:bg-white/[0.04] rounded-lg transition-colors" title="新对话">
                <EditIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="shrink-0 px-4 pb-3">
            <input
              type="text"
              value={conversationSearchQuery}
              onChange={(e) => setConversationSearchQuery(e.target.value)}
              placeholder="搜索聊天..."
              className="w-full rounded-xl border border-gray-200 bg-gray-100/80 px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:focus:border-blue-400 dark:focus:bg-white/[0.07]"
            />
          </div>
          <div className="space-y-1 overflow-y-auto flex-1 px-4 pb-4">
          {filteredConversations.length === 0 && (
            <div className="px-2 py-8 text-center text-sm text-gray-400">没有找到匹配的聊天</div>
          )}
          {filteredConversations.map((item) => {
            const isGeneratingTitle = Boolean(agentGeneratingTitleIds[item.id])
            return (
              <div
                key={item.id}
                data-agent-conversation-item
                className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-100 dark:hover:bg-white/[0.04]"
                onPointerDown={(e) => handleConversationPointerDown(item.id, e)}
                onPointerUp={clearConversationLongPressTimer}
                onPointerCancel={clearConversationLongPressTimer}
                onPointerLeave={clearConversationLongPressTimer}
                onContextMenu={(e) => {
                  if (conversationActionsId === item.id) e.preventDefault()
                }}
              >
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => handleConversationSelect(item.id)}>
                  <div className={`truncate ${item.id === activeConversationId ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{item.title}</div>
                  <div className="text-xs text-gray-400">{formatTime(item.updatedAt)}</div>
                </button>
                <div className={`flex shrink-0 items-center gap-1 overflow-hidden transition-all duration-150 group-hover:w-[4.5rem] group-hover:opacity-100 group-focus-within:w-[4.5rem] group-focus-within:opacity-100 ${conversationActionsId === item.id ? 'w-[4.5rem] opacity-100' : 'w-0 opacity-0'}`}>
                  <AgentActionButton tooltip="编辑标题" className="p-1.5 text-gray-400 hover:text-gray-700 disabled:text-gray-300 disabled:hover:text-gray-300 disabled:cursor-not-allowed dark:hover:text-gray-200 dark:disabled:text-gray-600 dark:disabled:hover:text-gray-600" onClick={() => handleRenameConversation(item.id, item.title)} disabled={isGeneratingTitle}>
                    <EditIcon className="w-4 h-4" />
                  </AgentActionButton>
                  <AgentActionButton tooltip="删除" className="p-1.5 text-gray-400 hover:text-red-500" onClick={() => handleDeleteConversation(item.id)}>
                    <TrashIcon className="w-4 h-4" />
                  </AgentActionButton>
                </div>
              </div>
            )
          })}
        </div>
        </div>
      </aside>

      {/* Center Chat Area */}
      <section className="min-w-0 flex-1 flex flex-col relative">
        {/* Mobile Header Toggles */}
        <div className={`sticky top-0 z-20 lg:hidden overflow-hidden transition-all duration-300 ease-in-out ${mobileTopBarVisible ? 'max-h-16 opacity-100 mb-2' : 'max-h-0 opacity-0 mb-0 pointer-events-none'}`}>
          <div
            className="flex h-14 items-center justify-between border-b border-gray-200 bg-white/80 px-2 backdrop-blur dark:border-white/[0.08] dark:bg-gray-950/80"
            onTouchStart={handleHeaderTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <button type="button" onClick={() => setSidebarCollapsed(false)} className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-lg transition-colors" title="展开对话列表">
              <SidebarLeftIcon className="w-5 h-5" />
            </button>
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate flex-1 text-center px-2">{conversation?.title || 'Agent'}</div>
            <button type="button" onClick={createConversation} className="p-2 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.04] rounded-lg transition-colors" title="新对话">
              <EditIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div 
          ref={scrollContainerRef}
          className="flex-1 space-y-4 overflow-visible pb-[calc(var(--input-bar-clearance,12rem)+1.5rem)] px-1 lg:pb-64 lg:pt-14 lg:px-4"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {!conversation ? (
            <div className="py-20 text-center text-gray-400">
              <p className="mb-3">还没有 Agent 对话</p>
              <button type="button" onClick={createConversation} className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 transition-colors">创建对话</button>
            </div>
          ) : (
            (() => {
              if (activeMessages.length === 0) {
                return (
                  <div className="py-20 text-center text-gray-400">
                    <p className="mb-2">开始新的 Agent 对话</p>
                    <p className="text-xs">在底部输入框发送消息即可创建第一轮对话。</p>
                  </div>
                )
              }

              const renderedMessages = activeMessages.map((message) => {
                const round = conversation.rounds.find((item) => item.id === message.roundId)
                const isAssistant = message.role === 'assistant'
                const isStreamingAssistant = isAssistant && round?.status === 'running'
                const isEditing = !isAssistant && round?.id === agentEditingRoundId
                const siblingRounds = !isAssistant && round ? getAgentSiblingRounds(conversation, round) : []
                const siblingIndex = round ? siblingRounds.findIndex((item) => item.id === round.id) : -1
                const hasBranches = siblingRounds.length > 1
                const tasksForRound = isAssistant ? getRoundTasks(round ?? null, tasks).filter(Boolean) as TaskRecord[] : []
                const favoriteTasksForRound = tasksForRound.filter((task) => (task.outputImages?.length ?? 0) > 0)
                const hasRoundFavoriteTasks = favoriteTasksForRound.length > 0
                const allRoundTasksFavorited = hasRoundFavoriteTasks && favoriteTasksForRound.every((task) => task.isFavorite)
                const inputImagesForRound = (round?.inputImageIds || []).map(id => ({ id, dataUrl: '' }))
                const parts = getPromptMentionParts(message.content, inputImagesForRound)
                return (
                  <div key={message.id} className={`flex w-full mb-6 ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                    <div
                      ref={(node) => {
                        if (!isAssistant && node) messageRefs.current.set(message.roundId, node)
                        else if (!isAssistant) messageRefs.current.delete(message.roundId)
                      }}
                      className={`group flex max-w-[95%] flex-col md:max-w-[85%] lg:max-w-[75%] ${isAssistant ? 'items-start' : 'items-end'}`}
                    >
                      <article 
                        className={`relative flex max-w-full flex-col rounded-2xl p-4 transition-all duration-200 ${
                        isAssistant 
                          ? 'bg-white/70 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.08] rounded-tl-sm hover:bg-white dark:hover:bg-white/[0.04]' 
                          : `bg-gray-100 dark:bg-[#2A2D31] rounded-tr-sm ${isEditing ? 'ring-2 ring-blue-500/50 dark:ring-blue-400/50' : ''}`
                      }`}
                      >
                    <div className="mb-2 flex items-center justify-between gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedRoundId(message.roundId); }} className="hover:text-gray-800 dark:hover:text-gray-200 transition-colors font-medium">
                         <span className={isAssistant ? 'text-blue-500 dark:text-blue-400' : ''}>{isAssistant ? 'Agent' : '用户'}</span> <span className="opacity-50 font-normal ml-1">· 第 {round?.index ?? '?'} 轮</span>
                      </button>
                    </div>
                    
                    {message.role === 'user' && round && round.inputImageIds.length > 0 && (
                      <div className="flex gap-2 mb-3 overflow-x-auto pb-1" onClick={e => e.stopPropagation()}>
                        {round.inputImageIds.map((imgId) => (
                          <ChatImageThumb key={imgId} imageId={imgId} />
                        ))}
                      </div>
                    )}

                    {round?.status === 'error' && isAssistant && message.content.startsWith('请求失败：') ? (
                      <div className="flex flex-col">
                        {(() => {
                          const content = message.content.replace(/^请求失败：/, '');
                          const [mainErr, ...hints] = content.split('\n提示：');
                          return (
                            <>
                              <div className="flex items-start gap-2 text-red-500 dark:text-red-400">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-[18px] h-[18px] mt-[1.5px] flex-shrink-0">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                                </svg>
                                <div className="whitespace-pre-wrap text-[14px] leading-relaxed break-words font-medium">
                                  {mainErr}
                                </div>
                              </div>
                              {hints.length > 0 && (
                                <div className="pl-[26px] mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-500 dark:text-gray-400 break-words opacity-90">
                                  <span className="font-medium">提示：</span>{hints.join('\n提示：')}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div data-selectable-text className={`text-[15px] leading-relaxed text-gray-800 dark:text-gray-100 ${!isAssistant ? 'select-text' : ''}`}>
                        {isAssistant ? (
                          <>
                            {message.content.trim() && <MarkdownRenderer content={message.content} streaming={isStreamingAssistant} />}
                            {isStreamingAssistant && !message.content.trim() && <AgentStreamingCursor />}
                          </>
                        ) : parts.some((part) => part.type === 'mention') ? (
                          <div className="whitespace-pre-wrap break-words">
                            {parts.map((part, i) =>
                              part.type === 'text' ? <span key={i}>{part.text}</span> : <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-100/50 text-blue-700 dark:bg-blue-500/30 dark:text-blue-300 text-xs font-medium mx-0.5 align-baseline">{part.text}</span>
                            )}
                          </div>
                        ) : (
                          <MarkdownRenderer content={parts[0]?.text ?? ''} />
                        )}
                      </div>
                    )}
                    
                    {message.role === 'assistant' && round && round.outputTaskIds.length > 0 && (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3" onClick={e => e.stopPropagation()}>
                        {round.outputTaskIds.map((taskId, index) => {
                          const task = tasks.find(t => t.id === taskId)
                          return task ? (
                            <TaskCard
                              key={task.id}
                              task={task}
                              disableSwipe={true}
                              onClick={() => setDetailTaskId(task.id)}
                              onReuse={() => handleReuse(task)}
                              onEditOutputs={() => editOutputs(task)}
                              onDelete={() => setConfirmDialog({ title: '删除记录', message: '确定要删除这条记录吗？', action: () => removeTask(task) })}
                            />
                          ) : (
                            <div key={index} className="rounded-xl bg-gray-50/50 dark:bg-white/[0.02] border border-dashed border-gray-200 dark:border-white/[0.08] p-4 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 min-h-[120px]">
                              <TrashIcon className="w-6 h-6 mb-2 opacity-50" />
                              <span className="text-xs">[Image Removed]</span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                      </article>

                    {!isStreamingAssistant && <div className={`mt-2 flex w-full min-w-fit items-center justify-between gap-3 px-1 transition-opacity duration-200 ${isEditing || hasBranches ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100'}`} onClick={e => e.stopPropagation()}>
                      <div className="flex min-w-0 items-center gap-2">
                        {isEditing && (
                          <div className="inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                            <span className="truncate">正在编辑</span>
                            <AgentActionButton
                              tooltip="取消编辑"
                              className="ml-1 -mr-1 p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-500/40 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPrompt('');
                                setInputImages([]);
                                clearMaskDraft();
                                setAgentEditingRoundId(null);
                              }}
                            >
                              <CloseIcon className="w-3 h-3" />
                            </AgentActionButton>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-auto text-gray-400">
                        {!isAssistant && round && hasBranches && siblingIndex >= 0 && (
                          <div className="inline-flex items-center text-sm font-bold text-gray-400 dark:text-gray-500 mr-1">
                            <AgentActionButton tooltip="上一分支" className="p-1 rounded-md hover:bg-gray-200/50 dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-gray-200 transition-colors" onClick={() => handleSwitchBranch(round, -1)}>
                              <ChevronLeftIcon className="w-4 h-4" />
                            </AgentActionButton>
                            <span className="px-1 tabular-nums tracking-widest">{siblingIndex + 1}/{siblingRounds.length}</span>
                            <AgentActionButton tooltip="下一分支" className="p-1 rounded-md hover:bg-gray-200/50 dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-gray-200 transition-colors" onClick={() => handleSwitchBranch(round, 1)}>
                              <ChevronRightIcon className="w-4 h-4" />
                            </AgentActionButton>
                          </div>
                        )}
                        {isAssistant ? (
                          <>
                            <AgentActionButton tooltip={allRoundTasksFavorited ? '取消收藏所有图片' : '收藏所有图片'} className={`p-1.5 rounded-md transition-colors ${hasRoundFavoriteTasks ? (allRoundTasksFavorited ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-500/10' : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-500/10') : 'text-gray-300 dark:text-gray-600 opacity-50 cursor-not-allowed'}`} disabled={!hasRoundFavoriteTasks} onClick={() => {
                              if (!hasRoundFavoriteTasks) return;
                              const nextFavorite = !allRoundTasksFavorited;
                              favoriteTasksForRound.forEach(t => updateTaskInStore(t.id, { isFavorite: nextFavorite }));
                              useStore.getState().showToast(nextFavorite ? `已收藏 ${favoriteTasksForRound.length} 个任务的图片` : `已取消收藏 ${favoriteTasksForRound.length} 个任务的图片`, 'success');
                            }}>
                              <FavoriteIcon className="w-4 h-4" filled={allRoundTasksFavorited} />
                            </AgentActionButton>
                            <AgentActionButton tooltip="下载所有图片" className={`p-1.5 rounded-md transition-colors ${getRoundTasks(round ?? null, tasks).filter(Boolean).length > 0 ? 'text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-500/10' : 'text-gray-300 dark:text-gray-600 opacity-50 cursor-not-allowed'}`} disabled={getRoundTasks(round ?? null, tasks).filter(Boolean).length === 0} onClick={async () => {
                              const imageIds = tasksForRound.flatMap(t => t.outputImages || []);
                              if (imageIds.length === 0) return;
                              let successCount = 0;
                              let failCount = 0;
                              for (const id of imageIds) {
                                try {
                                  let url = getCachedImage(id);
                                  if (!url) url = await ensureImageCached(id);
                                  if (!url) { failCount++; continue; }
                                  const res = await fetch(url);
                                  const blob = await res.blob();
                                  const objUrl = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = objUrl;
                                  const ext = blob.type.split('/')[1] || 'png';
                                  a.download = `image-${Date.now()}-${successCount}.${ext}`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(objUrl);
                                  successCount++;
                                  await new Promise(r => setTimeout(r, 100));
                                } catch {
                                  failCount++;
                                }
                              }
                              if (successCount === 0) useStore.getState().showToast('下载失败', 'error');
                              else if (failCount > 0) useStore.getState().showToast(`部分下载失败：成功 ${successCount}，失败 ${failCount}`, 'error');
                              else useStore.getState().showToast(successCount > 1 ? `下载成功：${successCount} 张图片` : '下载成功', 'success');
                            }}>
                              <DownloadIcon className="w-4 h-4" />
                            </AgentActionButton>
                            <AgentActionButton tooltip="删除消息" className="p-1.5 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors" onClick={() => {
                              if (round) handleDeleteMessage(message, round);
                            }}>
                              <TrashIcon className="w-4 h-4" />
                            </AgentActionButton>
                          </>
                        ) : (
                          <>
                            <AgentActionButton tooltip="复制提示词" className="p-1.5 rounded-md hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-white/[0.04] transition-colors" onClick={() => {
                              void handleCopyMessage(message.content);
                            }}>
                              <CopyIcon className="w-4 h-4" />
                            </AgentActionButton>
                            <AgentActionButton tooltip="编辑" className="p-1.5 rounded-md hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-white/[0.04] transition-colors" onClick={() => {
                               if (round) void handleEditRoundMessage(round, message.content);
                            }}>
                              <EditIcon className="w-4 h-4" />
                            </AgentActionButton>
                            <AgentActionButton tooltip="删除" className="p-1.5 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors" onClick={() => {
                              if (round) handleDeleteMessage(message, round);
                            }}>
                              <TrashIcon className="w-4 h-4" />
                            </AgentActionButton>
                          </>
                        )}
                      </div>
                    </div>}
                    </div>
                </div>
                )
              })

              const runningRounds = activeRounds.filter((round) =>
                round.status === 'running' &&
                !conversation.messages.some((message) => message.roundId === round.id && message.role === 'assistant'),
              )

              return (
                <>
                  {renderedMessages}
                  {runningRounds.map((round) => (
                    <div key={`running-${round.id}`} className="flex w-full justify-start mb-6">
                      <article className="flex max-w-[95%] flex-col rounded-2xl rounded-tl-sm border border-gray-200 bg-white/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03] md:max-w-[85%] lg:max-w-[75%]">
                        <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                          Agent <span className="ml-1 font-normal opacity-50">· 第 {round.index} 轮</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                          <span className="inline-flex items-center gap-1.5">
                            <span>正在生成回复</span>
                            <span className="flex gap-1">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
                            </span>
                          </span>
                        </div>
                      </article>
                    </div>
                  ))}
                </>
              )
            })()
          )}
        </div>
      </section>
    </main>
  )
}
