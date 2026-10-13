// Public MIT-licensed @raycast/api 2.7.3 declarations, documentation omitted.
import { ForwardRefExoticComponent } from 'react';
import { FunctionComponent } from 'react';
import { JSX } from 'react/jsx-runtime';
import { PathLike } from 'fs';
import { ReactElement } from 'react';
import { ReactNode } from 'react';
import { RefAttributes } from 'react';
export declare const Action: FunctionComponent<ActionProps> & ConvenienceActions & {
    Style: typeof ActionStyle;
};
export declare namespace Action {
    export type Props = ActionProps;
    export type Style = ActionStyle;
    export namespace CopyToClipboard {
        export type Props = CopyToClipboardProps;
    }
    export namespace CreateQuicklink {
        export type Props = CreateQuicklinkProps;
    }
    export namespace CreateSnippet {
        export type Props = CreateSnippetProps;
    }
    export namespace InstallMCPServer {
        export type Props = InstallMCPServerProps;
    }
    export namespace Open {
        export type Props = OpenProps;
    }
    export namespace OpenInBrowser {
        export type Props = OpenInBrowserProps;
    }
    export namespace OpenWith {
        export type Props = OpenWithProps;
    }
    export namespace Paste {
        export type Props = PasteProps;
    }
    export namespace Push {
        export type Props = PushProps;
    }
    export namespace ShowInFinder {
        export type Props = ShowInFinderProps;
    }
    export namespace SubmitForm {
        export type Props<T extends Form.Values> = SubmitFormProps<T>;
    }
    export namespace Trash {
        export type Props = TrashProps;
    }
    export namespace ToggleQuickLook {
        export type Props = ToggleQuickLookProps;
    }
    export namespace PickDate {
        export type Props = PickDateProps;
        export type Type = DatePickerType_2;
    }
}
export declare const ActionPanel: FunctionComponent<ActionPanelProps_2> & DeprecatedActionPanelMembers & ActionPanelMembers;
export declare namespace ActionPanel {
    export type Props = ActionPanelProps_2;
    export type Children = ActionPanelChildren_2;
    export namespace Section {
        export type Props = SectionProps;
        export type Children = SectionChildren;
    }
    export namespace Submenu {
        export type Props = SubmenuProps;
        export type Children = SubmenuChildren;
    }
}
export declare type ActionPanelChildren = ActionPanel.Children;
declare type ActionPanelChildren_2 = ReactElement<ActionPanel.Section.Props> | ReactElement<ActionPanel.Section.Props>[] | ActionPanel.Section.Children | null;
export declare const ActionPanelItem: FunctionComponent<ActionProps> & ConvenienceActions & {
    Style: ActionStyle;
};
export declare interface ActionPanelItemProps extends Action.Props {
}
declare interface ActionPanelMembers {
    Section: typeof Section;
    Submenu: typeof Submenu;
}
export declare interface ActionPanelProps extends ActionPanel.Props {
}
declare interface ActionPanelProps_2 {
    children?: ReactNode;
    title?: string;
}
export declare const ActionPanelSection: typeof ActionPanel.Section;
export declare type ActionPanelSectionChildren = ActionPanel.Section.Children;
export declare interface ActionPanelSectionProps extends ActionPanel.Section.Props {
}
export declare interface ActionPanelState {
    update: (actionPanel: ReactNode) => void;
}
export declare const ActionPanelSubmenu: typeof ActionPanel.Submenu;
export declare interface ActionPanelSubmenuProps extends ActionPanel.Submenu.Props {
}
declare interface ActionProps {
    id?: string;
    title: string;
    icon?: Image.ImageLike | undefined | null;
    style?: ActionStyle;
    shortcut?: Keyboard.Shortcut | undefined | null;
    onAction?: () => void;
    autoFocus?: boolean;
}
declare interface ActionsInterface {
    actions?: ReactNode;
}
declare enum ActionStyle {
    Regular = "regular",
    Destructive = "destructive"
}
export declare namespace AI {
    export function experimental_decide<const Questions extends DecisionQuestions>(input: {
        state: unknown;
        questions: Questions;
    }, options?: {
        signal?: AbortSignal;
    }): Promise<DecisionAnswers<Questions>>;
    export function ask(prompt: string, options?: AskOptions): Promise<string> & {
        on(event: "data", listener: (chunk: string) => void): void;
    };
    export function refreshModels(): Promise<void>;
    export type AskOptions = {
        creativity?: Creativity;
        model?: ModelSelector;
        signal?: AbortSignal;
    };
    export type Creativity = "none" | "low" | "medium" | "high" | "maximum" | number;
    export type ModelSelector = Model | {
        id: string;
    };
    export enum Model {
        "OpenAI_GPT-5.3_Codex" = "openai-gpt-5.3-codex",
        "OpenAI_GPT-5.4" = "openai-gpt-5.4",
        "OpenAI_GPT-5.4_mini" = "openai-gpt-5.4-mini",
        "OpenAI_GPT-5.4_nano" = "openai-gpt-5.4-nano",
        "OpenAI_GPT-5.5" = "openai-gpt-5.5",
        "OpenAI_GPT-5.5_Instant" = "openai-gpt-5.5-instant",
        "OpenAI_GPT-5.6_Terra" = "openai-gpt-5.6-terra",
        "OpenAI_GPT-5.6_Luna" = "openai-gpt-5.6-luna",
        "OpenAI_GPT-6_Astra" = "openai-gpt-6-astra",
        "OpenAI_GPT-6_Sol" = "openai-gpt-6-sol",
        "OpenAI_GPT-6.1_Sol" = "openai-gpt-6.1-sol",
        "OpenAI_GPT-6_Luna" = "openai-gpt-6-luna",
        "Groq_GPT-OSS_20b" = "groq-openai/gpt-oss-20b",
        "Groq_GPT-OSS_120b" = "groq-openai/gpt-oss-120b",
        "Anthropic_Claude_Haiku_4.5" = "anthropic-claude-4-5-haiku",
        "Anthropic_Claude_Sonnet_4.6" = "anthropic-claude-sonnet-4-6",
        "Anthropic_Claude_Sonnet_5" = "anthropic-claude-sonnet-5",
        "Anthropic_Claude_Sonnet_5.5" = "anthropic-claude-sonnet-5-5",
        "Anthropic_Claude_Opus_4.7" = "anthropic-claude-opus-4-7",
        "Anthropic_Claude_Opus_4.8" = "anthropic-claude-opus-4-8",
        "Anthropic_Claude_Opus_5" = "anthropic-claude-opus-5",
        "Anthropic_Claude_Opus_5.5" = "anthropic-claude-opus-5-5",
        "Anthropic_Claude_Fable_5.1" = "anthropic-claude-fable-5-1",
        "Perplexity_Sonar" = "perplexity-sonar",
        "Perplexity_Sonar_Pro" = "perplexity-sonar-pro",
        "Mistral_Nemo" = "mistral-open-mistral-nemo",
        "Mistral_Large" = "mistral-mistral-large-latest",
        "Mistral_Medium" = "mistral-mistral-medium-latest",
        "Mistral_Small" = "mistral-mistral-small-latest",
        "Mistral_Codestral" = "mistral-codestral-latest",
        "Google_Gemini_3.8_Flash" = "google-gemini-3.8-flash",
        "Google_Gemini_3.7_Flash" = "google-gemini-3.7-flash",
        "Google_Gemini_3.6_Flash" = "google-gemini-3.6-flash",
        "Google_Gemini_3.5_Flash" = "google-gemini-3.5-flash",
        "Google_Gemini_3.5_Flash_Lite" = "google-gemini-3.5-flash-lite",
        "Google_Gemini_3.1_Flash_Lite" = "google-gemini-3.1-flash-lite",
        "Google_Gemini_3_Flash" = "google-gemini-3-flash",
        "Google_Gemini_3.1_Pro" = "google-gemini-3.1-pro",
        "xAI_Grok-4.7" = "xai-grok-4.7",
        "xAI_Grok-4.6" = "xai-grok-4.6",
        "xAI_Grok-4.5" = "xai-grok-4.5",
        "xAI_Grok-4.3" = "xai-grok-4.3",
        "Vercel_GLM-5.2" = "gateway-zai/glm-5.2",
        "Vercel_GLM-5.3" = "gateway-zai/glm-5.3",
        "Vercel_GLM-5.3_Flash" = "gateway-zai/glm-5.3-flash",
        "Vercel_Kimi_K2.7_Code" = "gateway-moonshotai/kimi-k2.7-code",
        "Vercel_Kimi_K3" = "gateway-moonshotai/kimi-k3",
        "Vercel_Gemma_4_31B" = "gateway-google/gemma-4-31b-it",
        "Vercel_Inkling" = "gateway-thinkingmachines/inkling",
        "Vercel_Inkling_Small" = "gateway-thinkingmachines/inkling-small",
        "Vercel_DeepSeek_V4_Flash" = "gateway-deepseek/deepseek-v4-flash",
        "Vercel_DeepSeek_V4.1_Flash" = "gateway-deepseek/deepseek-v4.1-flash",
        "Vercel_DeepSeek_V4_Pro" = "gateway-deepseek/deepseek-v4-pro-0813",
        "Vercel_Qwen3.8_Max" = "gateway-alibaba/qwen3.8-max",
        "OpenAI_GPT-5_mini" = "openai-gpt-5-mini",
        "OpenAI_GPT-5_nano" = "openai-gpt-5-nano",
        "OpenAI_GPT-4.1" = "openai-gpt-4.1",
        "OpenAI_GPT-4.1_mini" = "openai-gpt-4.1-mini",
        "OpenAI_GPT-4.1_nano" = "openai-gpt-4.1-nano",
        "OpenAI_GPT-4" = "openai-gpt-4",
        "OpenAI_GPT-4o" = "openai-gpt-4o",
        "OpenAI_GPT-4o_mini" = "openai-gpt-4o-mini",
        "OpenAI_GPT-5.1" = "openai-gpt-5.1",
        "OpenAI_GPT-5.2" = "openai-gpt-5.2",
        "OpenAI_GPT-5.3_Instant" = "openai-gpt-5.3-instant",
        "OpenAI_GPT-5.6_Sol" = "openai-gpt-5.6-sol",
        "OpenAI_o4-mini" = "openai_o1-o4-mini",
        "OpenAI_o3-mini" = "openai_o1-o3-mini",
        "Google_Gemini_2.5_Pro" = "google-gemini-2.5-pro",
        "Google_Gemini_2.5_Flash" = "google-gemini-2.5-flash",
        "Google_Gemini_2.5_Flash_Lite" = "google-gemini-2.5-flash-lite",
        "OpenAI_GPT-5" = "openai-gpt-5.6-terra",
        "OpenAI_o3" = "openai-gpt-5.6-terra",
        "Anthropic_Claude_Sonnet_4.5" = "anthropic-claude-sonnet-5",
        "xAI_Grok-4.20" = "xai-grok-4.5",
        "OpenAI_GPT-4_Turbo" = "openai-gpt-5.6-terra",
        "OpenAI_GPT-5.2_Instant" = "openai-gpt-5.6-sol",
        "OpenAI_o1" = "openai-gpt-5.6-terra",
        "Groq_Llama_3.3_70B" = "groq-openai/gpt-oss-120b",
        "Groq_Llama_3.1_8B" = "groq-openai/gpt-oss-20b",
        "Groq_Qwen3-32B" = "groq-openai/gpt-oss-120b",
        "Baseten_Kimi_K2.7_Code" = "gateway-moonshotai/kimi-k2.7-code",
        "Baseten_GLM-5.2" = "gateway-zai/glm-5.2",
        "Baseten_DeepSeek_V4_Pro" = "gateway-deepseek/deepseek-v4-pro-0813",
        "xAI_Grok-3_Mini_Beta" = "xai-grok-4.3",
        "Baseten_GLM-5" = "gateway-zai/glm-5.2",
        "Gateway_Kimi_K3" = "gateway-moonshotai/kimi-k3",
        "OpenAI_GPT-5.1_Instant" = "openai-gpt-5.5-instant",
        "Baseten_Kimi_K2.6" = "gateway-moonshotai/kimi-k3",
        "OpenAI_GPT-5.1_Codex" = "openai-gpt-5.3-codex",
        "Anthropic_Claude_Opus_4.6" = "anthropic-claude-opus-5",
        "Groq_Llama_4_Scout" = "groq-openai/gpt-oss-120b",
        "Baseten_MiniMax_M2.5" = "gateway-deepseek/deepseek-v4-pro-0813",
        "Baseten_Kimi_K2.5" = "gateway-moonshotai/kimi-k3",
        "Anthropic_Claude_Sonnet_4" = "anthropic-claude-sonnet-4-6",
        "Anthropic_Claude_3.5_Haiku" = "anthropic-claude-4-5-haiku",
        "Anthropic_Claude_4.5_Haiku" = "anthropic-claude-4-5-haiku",
        "Anthropic_Claude_4_Sonnet" = "anthropic-claude-sonnet-4-6",
        "Anthropic_Claude_4.5_Sonnet" = "anthropic-claude-sonnet-5",
        "Anthropic_Claude_4_Opus" = "anthropic-claude-opus-4-8",
        "Anthropic_Claude_4.1_Opus" = "anthropic-claude-opus-4-8",
        "Together_AI_Llama_3.1_405B" = "openai-gpt-5.4-mini",
        "Mistral_Small_3" = "mistral-mistral-small-latest",
        "Groq_Kimi_K2_Instruct" = "groq-openai/gpt-oss-120b",
        "Google_Gemini_2.0_Flash" = "google-gemini-3.5-flash",
        "Together_AI_Qwen3-235B-A22B-Instruct-2507-tput" = "openai-gpt-5.4-mini",
        "Together_AI_DeepSeek-R1" = "openai-gpt-5.4-mini",
        "Together_AI_DeepSeek-V3" = "openai-gpt-5.4-mini",
        "xAI_Grok-4" = "xai-grok-4.3",
        "xAI_Grok-4_Fast" = "xai-grok-4.3",
        "xAI_Grok_Code_Fast_1" = "xai-grok-4.3",
        "xAI_Grok-3_Beta" = "xai-grok-4.3",
        "xAI_Grok-2" = "xai-grok-4.3",
        "Anthropic_Claude_3.7_Sonnet" = "anthropic-claude-sonnet-5",
        "OpenAI_GPT3.5-turbo-instruct" = "openai-gpt-4o-mini",
        "Anthropic_Claude_Opus" = "anthropic-claude-opus-4-8",
        "Google_Gemini_2.0_Flash_Thinking" = "google-gemini-2.5-flash",
        "Llama2_70B" = "groq-openai/gpt-oss-120b",
        "Perplexity_Sonar_Medium_Online" = "perplexity-sonar",
        "Perplexity_Sonar_Small_Online" = "perplexity-sonar",
        "Codellama_70B_instruct" = "groq-openai/gpt-oss-120b",
        "Perplexity_Llama3_Sonar_Large" = "perplexity-sonar",
        "Perplexity_Llama3_Sonar_Small" = "perplexity-sonar",
        "OpenAI_GPT3.5-turbo" = "openai-gpt-4o-mini",
        "Llama3.1_70B" = "groq-openai/gpt-oss-120b",
        "Perplexity_Llama3.1_Sonar_Huge" = "perplexity-sonar-pro",
        "Perplexity_Llama3.1_Sonar_Large" = "perplexity-sonar",
        "Perplexity_Llama3.1_Sonar_Small" = "perplexity-sonar",
        "Mistral_Large2" = "mistral-mistral-large-latest",
        "Groq_DeepSeek_R1_Distill_Llama_3.3_70B" = "openai-gpt-5.4-mini",
        "Together_DeepSeek_R1" = "openai-gpt-5.4-mini",
        "MixtraL_8x7B" = "mistral-open-mistral-nemo",
        "Google_Gemini_1.5_Flash" = "google-gemini-2.5-flash",
        "Google_Gemini_1.5_Pro" = "google-gemini-2.5-flash",
        "Mixtral_8x7B" = "mistral-open-mistral-nemo",
        "Qwen_2.5_32B" = "openai-gpt-4o-mini",
        "OpenAI_o1-preview" = "openai-gpt-5.6-terra",
        "OpenAI_o1-mini" = "openai_o1-o4-mini",
        "Llama3_70B" = "groq-openai/gpt-oss-120b",
        "Anthropic_Claude_Sonnet_3.7" = "anthropic-claude-sonnet-5",
        "Anthropic_Claude_Sonnet" = "anthropic-claude-sonnet-5",
        "Perplexity_Sonar_Reasoning" = "perplexity-sonar-pro",
        "OpenAI_GPT_OSS_20b" = "groq-openai/gpt-oss-20b",
        "OpenAI_GPT_OSS_120b" = "groq-openai/gpt-oss-120b",
        "OpenAI_GPT5" = "openai-gpt-5.6-terra",
        "OpenAI_GPT5-mini" = "openai-gpt-5-mini",
        "OpenAI_GPT5-nano" = "openai-gpt-5-nano",
        "OpenAI_GPT4" = "openai-gpt-4",
        "OpenAI_GPT4-turbo" = "openai-gpt-5.6-terra",
        "OpenAI_GPT4.1" = "openai-gpt-4.1",
        "OpenAI_GPT4.1-nano" = "openai-gpt-4.1-nano",
        "OpenAI_GPT4.1-mini" = "openai-gpt-4.1-mini",
        "OpenAI_GPT4o" = "openai-gpt-4o",
        "OpenAI_GPT4o-mini" = "openai-gpt-4o-mini",
        "Anthropic_Claude_Haiku" = "anthropic-claude-4-5-haiku",
        "Llama3.3_70B" = "groq-openai/gpt-oss-120b",
        "Llama3.1_8B" = "groq-openai/gpt-oss-20b",
        "Llama3.1_405B" = "openai-gpt-5.4-mini",
        "Llama4_Scout" = "groq-openai/gpt-oss-120b",
        "DeepSeek_R1" = "openai-gpt-5.4-mini",
        "DeepSeek_V3" = "openai-gpt-5.4-mini",
        "xAI_Grok_2" = "xai-grok-4.3",
        "xAI_Grok_3" = "xai-grok-4.3",
        "xAI_Grok_4" = "xai-grok-4.3",
        "xAI_Grok_3_Mini" = "xai-grok-4.3",
        "Groq_Qwen3_32B" = "groq-openai/gpt-oss-120b",
        "Groq_Qwen3_235B_A22B_Instruct_2507_tput" = "openai-gpt-5.4-mini",
        "Anthropic_Claude_4.6_Sonnet" = "anthropic-claude-sonnet-4-6",
        "Anthropic_Claude_4.5_Opus" = "anthropic-claude-opus-5",
        "Anthropic_Claude_4.6_Opus" = "anthropic-claude-opus-5",
        "Anthropic_Claude_4.7_Opus" = "anthropic-claude-opus-4-7",
        "Together_AI_Kimi_K2.5" = "together-moonshotai/Kimi-K2.5",
        "xAI_Grok-4.1_Fast" = "xai-grok-4.5",
        "Google_Gemini_3_Pro" = "google-gemini-3.1-pro",
        "OpenAI_GPT-5_Codex" = "openai-gpt-5.3-codex",
        "Google_Gemini_2.0_Flash_Lite" = "google-gemini-3.1-flash-lite"
    }
    export type RegisteredModel = ExtensionModel<Image.ImageLike>;
    export type GetModels = ExtensionGetModels<Image.ImageLike>;
    export type StreamCompletion = ExtensionStreamCompletion<Image.ImageLike>;
    export type ModelMessage = ExtensionModelMessage;
    export type ModelTool = ExtensionModelTool;
    export type ModelToolSet = ExtensionModelToolSet;
    export type ModelProviderOptions = ExtensionModelProviderOptions;
    export type ModelMessageContent = ExtensionModelAssistantMessageContent | ExtensionModelUserMessageContent;
    export type ModelRequest = ExtensionModelRequest;
    export type ModelTextStream = ExtensionModelTextStream;
    export type ModelStreamPart = ExtensionModelStreamPart;
    export type ModelFullStream = ExtensionModelFullStream;
    export type ModelStream = ExtensionModelStream;
}
export declare namespace Alert {
    export interface Options {
        icon?: Image.ImageLike;
        title: string;
        message?: string;
        primaryAction?: ActionOptions;
        dismissAction?: ActionOptions;
        rememberUserChoice?: boolean;
    }
    export interface ActionOptions {
        title: string;
        style?: ActionStyle;
        onAction?: () => void;
    }
    const ActionStyle: typeof AlertActionStyle_2;
    export type ActionStyle = AlertActionStyle_2;
    export namespace ActionStyle {
        export type Default = AlertActionStyle_2.Default;
        export type Cancel = AlertActionStyle_2.Cancel;
        export type Destructive = AlertActionStyle_2.Destructive;
    }
}
export declare interface AlertActionOptions extends Alert.ActionOptions {
}
export declare const AlertActionStyle: typeof Alert.ActionStyle;
declare enum AlertActionStyle_2 {
    Default = "default",
    Cancel = "cancel",
    Destructive = "destructive"
}
export declare interface AlertOptions extends Alert.Options {
}
export declare const allLocalStorageItems: typeof LocalStorage.allItems;
export declare interface Application {
    name: string;
    localizedName?: string;
    path: string;
    bundleId?: string;
    windowsAppId?: string;
}
declare interface Arguments {
    [item: string]: any;
}
export declare interface ArgumentsLaunchProps {
    arguments?: Arguments;
}
export declare namespace BrowserExtension {
    export function getContent(options?: {
        format?: "html" | "text" | "markdown";
        cssSelector?: string;
        tabId?: number;
    }): Promise<string>;
    export interface Tab {
        id: number;
        url: string;
        title?: string;
        favicon?: string;
        active: boolean;
    }
    export function getTabs(): Promise<Tab[]>;
}
export declare class Cache {
    static get STORAGE_DIRECTORY_NAME(): string;
    static get DEFAULT_CAPACITY(): number;
    private directory;
    private namespace?;
    private capacity;
    private journal;
    private storage;
    private subscribers;
    constructor(options?: Cache.Options);
    get storageDirectory(): string;
    get(key: string): string | undefined;
    has(key: string): boolean;
    get isEmpty(): boolean;
    set(key: string, data: string): void;
    remove(key: string): boolean;
    clear(options?: {
        notifySubscribers: boolean;
    }): void;
    subscribe(subscriber: Cache.Subscriber): Cache.Subscription;
    private maintainCapacity;
    private notifySubscribers;
}
export declare namespace Cache {
    export interface Options {
        namespace?: string;
        directory?: string;
        capacity?: number;
    }
    export type Subscriber = (key: string | undefined, data: string | undefined) => void;
    export type Subscription = () => void;
}
export declare function captureException(exception: unknown): void;
export declare function captureMemorySnapshot(label: string): void;
declare const Checkbox: ForwardRefExoticComponent<CheckboxProps & RefAttributes<CheckboxRef>>;
declare interface CheckboxProps extends FormItemProps_2<boolean> {
    label: string;
}
declare type CheckboxRef = FormItemRef;
declare type ChoiceAnswer<Option extends string = string> = {
    type: "choice";
    choice: Option;
    confidence: number;
    probabilities: Record<Option, number>;
};
declare type ChoiceQuestion<Option extends string = string> = {
    type: "choice";
    instructions: string;
    criteria: Record<Option, string | null>;
};
export declare const clearClipboard: typeof Clipboard.clear;
export declare const clearLocalStorage: typeof LocalStorage.clear;
export declare function clearSearchBar(options?: {
    forceScrollToTop?: boolean;
}): Promise<void>;
export declare namespace Clipboard {
    export function copy(content: string | number | Content, options?: CopyOptions): Promise<void>;
    export function clear(): Promise<void>;
    export function paste(content: string | number | Content): Promise<void>;
    export function read(options?: {
        offset?: number;
    }): Promise<ReadContent>;
    export function readText(options?: {
        offset?: number;
    }): Promise<string | undefined>;
    export type ReadContent = {
        text: string;
        file?: string;
        html?: string;
    };
    export type Content = {
        text: string;
    } | {
        file: PathLike;
    } | {
        html: string;
        text?: string;
    };
    export type CopyOptions = {
        transient?: boolean;
        concealed?: boolean;
    };
}
export declare function closeMainWindow(options?: {
    clearRootSearch?: boolean;
    popToRootType?: PopToRootType;
}): Promise<void>;
export declare enum Color {
    Blue = "raycast-blue",
    Green = "raycast-green",
    Magenta = "raycast-magenta",
    Orange = "raycast-orange",
    Purple = "raycast-purple",
    Red = "raycast-red",
    Yellow = "raycast-yellow",
    PrimaryText = "raycast-primary-text",
    SecondaryText = "raycast-secondary-text"
}
export declare namespace Color {
    export type ColorLike = Color | Color.Dynamic | Color.Raw;
    export interface Dynamic {
        light: Color.Raw;
        dark: Color.Raw;
        adjustContrast?: boolean | undefined | null;
    }
    export type Raw = string;
    const Brown: Color.Dynamic;
}
export declare type ColorLike = Color.ColorLike;
export declare function confirmAlert(options: Alert.Options): Promise<boolean>;
declare interface ConvenienceActions {
    CopyToClipboard: typeof CopyToClipboard;
    Open: typeof Open;
    OpenInBrowser: typeof OpenInBrowser;
    OpenWith: typeof OpenWith;
    Paste: typeof Paste;
    Push: typeof Push;
    ShowInFinder: typeof ShowInFinder;
    SubmitForm: typeof SubmitForm;
    Trash: typeof Trash;
    CreateSnippet: typeof CreateSnippet;
    CreateQuicklink: typeof CreateQuicklink;
    InstallMCPServer: typeof InstallMCPServer;
    ToggleQuickLook: typeof ToggleQuickLook;
    PickDate: typeof PickDate;
}
export declare const copyTextToClipboard: typeof Clipboard.copy;
declare const CopyToClipboard: FunctionComponent<CopyToClipboardProps>;
export declare const CopyToClipboardAction: FunctionComponent<CopyToClipboardProps>;
export declare interface CopyToClipboardActionProps extends Action.CopyToClipboard.Props {
}
declare interface CopyToClipboardProps {
    content: string | number | Clipboard.Content;
    title?: string;
    icon?: Image.ImageLike;
    transient?: boolean;
    concealed?: boolean;
    shortcut?: Keyboard.Shortcut;
    onCopy?: (content: string | number | Clipboard.Content) => void;
}
declare const CreateQuicklink: FunctionComponent<CreateQuicklinkProps>;
declare interface CreateQuicklinkProps {
    quicklink: Quicklink;
    title?: string;
    icon?: Image.ImageLike;
    shortcut?: Keyboard.Shortcut;
}
declare const CreateSnippet: FunctionComponent<CreateSnippetProps>;
declare interface CreateSnippetProps {
    snippet: Snippet;
    title?: string;
    icon?: Image.ImageLike;
    shortcut?: Keyboard.Shortcut;
}
declare const DatePicker: ForwardRefExoticComponent<DatePickerProps & RefAttributes<DatePickerRef>> & DatePickerMembers;
declare interface DatePickerMembers {
    Type: typeof DatePickerType;
    isFullDay(date?: Date | null): boolean;
}
declare interface DatePickerMembers_2 {
    Type: typeof DatePickerType_2;
    isFullDay(date?: Date | null): boolean;
}
declare interface DatePickerProps extends FormItemProps_2<Date | null> {
    type?: DatePickerType;
    min?: Date | undefined;
    max?: Date | undefined;
}
declare type DatePickerRef = FormItemRef;
declare enum DatePickerType {
    Date = "date",
    DateTime = "date_time"
}
declare enum DatePickerType_2 {
    Date = "date",
    DateTime = "date_time"
}
declare type DecisionAnswer<Question extends DecisionQuestion> = Question extends ChoiceQuestion<infer Option> ? ChoiceAnswer<Option> : Extract<NoulAnswer | ScoreAnswer, {
    type: Question["type"];
}>;
declare type DecisionAnswers<Questions extends DecisionQuestions> = {
    [Key in keyof Questions]: DecisionAnswer<Questions[Key]>;
};
declare type DecisionQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;
declare type DecisionQuestions = Record<string, DecisionQuestion>;
declare interface DeprecatedActionPanelMembers {
    Item: typeof Action;
}
declare interface DeprecatedFormMembers {
    DropdownSection: typeof DropdownSection;
    DropdownItem: typeof DropdownItem;
    TagPickerItem: typeof TagPickerItem;
}
declare const Description: FunctionComponent<DescriptionProps>;
declare interface DescriptionProps {
    title?: string;
    text: string;
}
export declare const Detail: FunctionComponent<DetailProps_2> & DetailMembers;
export declare namespace Detail {
    export type Props = DetailProps_2;
    export namespace Metadata {
        export type Props = MetadataProps;
        export namespace Label {
            export type Props = LabelProps;
        }
        export namespace Separator {
            export type Props = SeparatorProps_2;
        }
        export namespace Link {
            export type Props = LinkProps;
        }
        export namespace TagList {
            export type Props = TagListProps;
            export namespace Item {
                export type Props = TagListItemProps;
            }
        }
    }
}
declare const Detail_2: FunctionComponent<DetailProps_3> & DetailMembers_2;
declare interface DetailMembers {
    Metadata: typeof Metadata;
}
declare interface DetailMembers_2 {
    Metadata: typeof Metadata;
}
export declare interface DetailProps extends Detail.Props {
}
declare interface DetailProps_2 extends ActionsInterface, NavigationChildInterface {
    markdown?: string | null;
    metadata?: ReactNode;
}
declare interface DetailProps_3 {
    isLoading?: boolean;
    markdown?: string | null;
    metadata?: ReactNode;
}
declare const Dropdown: ForwardRefExoticComponent<DropdownProps & RefAttributes<DropdownRef>> & DropdownMembers;
declare const Dropdown_2: FunctionComponent<DropdownProps_2> & DropdownMembers_2;
declare const DropdownItem: FunctionComponent<DropdownItemProps>;
declare const DropdownItem_2: FunctionComponent<DropdownItemProps_2>;
declare interface DropdownItemProps {
    value: string;
    title: string;
    icon?: Image.ImageLike;
    keywords?: string[];
}
declare interface DropdownItemProps_2 {
    value: string;
    title: string;
    icon?: Image.ImageLike | undefined | null;
    keywords?: string[];
}
declare interface DropdownMembers {
    Section: typeof DropdownSection;
    Item: typeof DropdownItem;
}
declare interface DropdownMembers_2 {
    Section: typeof DropdownSection_2;
    Item: typeof DropdownItem_2;
}
declare interface DropdownProps extends FormItemProps_2<string>, SearchBarInterface {
    placeholder?: string;
    children?: ReactNode;
}
declare interface DropdownProps_2 extends SearchBarInterface {
    id?: string;
    tooltip: string;
    placeholder?: string;
    storeValue?: boolean | undefined;
    value?: string;
    defaultValue?: string;
    children?: ReactNode;
    onChange?: (newValue: string) => void;
}
declare type DropdownRef = FormItemRef;
declare const DropdownSection: FunctionComponent<DropdownSectionProps>;
declare const DropdownSection_2: FunctionComponent<DropdownSectionProps_2>;
declare interface DropdownSectionProps {
    children?: ReactNode;
    title?: string;
}
declare interface DropdownSectionProps_2 {
    children?: ReactNode;
    title?: string;
}
export declare type DynamicColor = Color.Dynamic;
declare const EmptyView: FunctionComponent<EmptyViewProps>;
declare interface EmptyViewProps extends ActionsInterface {
    icon?: Image.ImageLike | undefined | null;
    title?: string;
    description?: string;
}
declare interface EntryPointTypes {
    command: unknown;
    tool: unknown;
}
export declare interface Environment {
    raycastVersion: string;
    ownerOrAuthorName: string;
    extensionName: string;
    entryPointType: keyof EntryPointTypes;
    entryPointName: string;
    entryPointMode: "no-view" | "view" | "menu-bar";
    assetsPath: string;
    supportPath: string;
    isDevelopment: boolean;
    appearance: "light" | "dark";
    textSize: "medium" | "large";
    launchType: LaunchType;
    canAccess(api: unknown): boolean;
    theme: "light" | "dark";
    launchContext?: LaunchContext;
    commandName: string;
    commandMode: "no-view" | "view" | "menu-bar";
}
export declare const environment: Environment;
declare type ExtensionGetModels<TIcon = unknown> = () => ExtensionModel<TIcon>[] | Promise<ExtensionModel<TIcon>[]>;
declare type ExtensionModel<TIcon = unknown> = {
    id: string;
    title: string;
    isLocal?: boolean;
    icon?: TIcon;
    description?: string;
    capabilities?: {
        systemMessage?: {
            supported: boolean;
        };
        temperature?: {
            supported: boolean;
        };
        vision?: {
            mediaTypes: Array<"image/png" | "image/jpeg" | "image/webp" | "image/gif">;
        };
        tools?: {
            supported: boolean;
        };
        streaming?: {
            supported: boolean;
        };
        reasoningEffort?: {
            supported: boolean;
            options: string[];
            default: string;
        };
    };
    contextWindow?: number;
    sizeInBytes?: number;
};
declare type ExtensionModelAssistantMessageContent = Array<{
    type: "text";
    text: string;
} | {
    type: "file";
    data: string | Uint8Array | ArrayBuffer | URL;
    mediaType: string;
} | {
    type: "reasoning";
    text: string;
} | {
    type: "tool-call";
    toolCallId: string;
    toolName: string;
    input: unknown;
}>;
declare type ExtensionModelFullStream = ReadableStream<ExtensionModelStreamPart> | AsyncIterable<ExtensionModelStreamPart>;
declare type ExtensionModelMessage = {
    role: "system";
    content: string;
} | {
    role: "user";
    content: ExtensionModelUserMessageContent;
} | {
    role: "assistant";
    content: ExtensionModelAssistantMessageContent;
} | {
    role: "tool";
    content: Array<{
        type: "tool-result";
        toolCallId: string;
        toolName: string;
        input?: unknown;
        output: {
            type: "json";
            value: JSONValue;
        };
    }>;
};
declare type ExtensionModelProviderOptions = Record<string, Record<string, unknown>> & {
    raycast: Record<string, unknown> & {
        locale: string;
        currentDate: string;
        reasoningEffort?: string;
        sessionId: string;
    };
};
declare type ExtensionModelRequest = {
    system?: string;
    messages?: ExtensionModelMessage[];
    temperature?: number;
    tools?: ExtensionModelToolSet;
    toolChoice?: "auto" | "required";
    providerOptions: ExtensionModelProviderOptions;
};
declare type ExtensionModelStream = ExtensionModelFullStream | ExtensionModelTextStream | {
    fullStream: ExtensionModelFullStream;
} | {
    textStream: ExtensionModelTextStream;
};
declare type ExtensionModelStreamPart = {
    type: "text-start";
    id: string;
    [key: string]: unknown;
} | {
    type: "text-end";
    id: string;
    [key: string]: unknown;
} | {
    type: "text";
    text: string;
} | {
    type: "text-delta";
    id?: string;
    text?: string;
    textDelta?: string;
    [key: string]: unknown;
} | {
    type: "reasoning-start";
    id: string;
    [key: string]: unknown;
} | {
    type: "reasoning-end";
    id: string;
    [key: string]: unknown;
} | {
    type: "reasoning";
    text: string;
} | {
    type: "reasoning-delta";
    id?: string;
    text?: string;
    textDelta?: string;
    [key: string]: unknown;
} | {
    type: "source";
    sourceType: "url";
    id: string;
    url: string;
    title?: string;
    [key: string]: unknown;
} | {
    type: "source";
    sourceType: "document";
    id: string;
    mediaType: string;
    title?: string;
    filename?: string;
    [key: string]: unknown;
} | {
    type: "file";
    file: unknown;
} | {
    type: "tool-call-streaming-start";
    toolCallId: string;
    toolName: string;
} | {
    type: "tool-call-delta";
    toolCallId: string;
    toolName: string;
    argsTextDelta: string;
} | {
    type: "tool-input-start";
    id: string;
    toolName: string;
    [key: string]: unknown;
} | {
    type: "tool-input-end";
    id: string;
    [key: string]: unknown;
} | {
    type: "tool-input-delta";
    id: string;
    delta: string;
    [key: string]: unknown;
} | {
    type: "tool-input-error";
    id?: string;
    error?: unknown;
    [key: string]: unknown;
} | {
    type: "tool-call";
    toolCallId: string;
    toolName: string;
    input: unknown;
} | {
    type: "tool-result";
    toolCallId: string;
    toolName: string;
    input?: unknown;
    output?: unknown;
} | {
    type: "tool-error";
    toolCallId: string;
    toolName: string;
    input?: unknown;
    error: unknown;
    [key: string]: unknown;
} | {
    type: "tool-output-denied";
    toolCallId: string;
    toolName: string;
    [key: string]: unknown;
} | {
    type: "tool-approval-request";
    approvalId: string;
    toolCall: unknown;
    [key: string]: unknown;
} | {
    type: "finish";
    finishReason: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other" | "unknown";
    totalUsage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
        [key: string]: unknown;
    };
} | {
    type: "error";
    error: unknown;
} | {
    type: "abort";
    reason?: unknown;
} | {
    type: "start" | "stream-start" | "response-metadata" | "start-step" | "finish-step" | "reasoning-part-finish" | "step-start" | "raw";
    [key: string]: unknown;
};
declare type ExtensionModelTextStream = ReadableStream<string> | AsyncIterable<string>;
declare type ExtensionModelTool = {
    type?: "function";
    description?: string;
    inputSchema?: unknown;
};
declare type ExtensionModelToolSet = Record<string, ExtensionModelTool>;
declare type ExtensionModelUserMessageContent = Array<{
    type: "text";
    text: string;
} | {
    type: "file";
    data: string | Uint8Array | ArrayBuffer | URL;
    mediaType: string;
}>;
declare type ExtensionStreamCompletion<TIcon = unknown> = (model: ExtensionModel<TIcon>, request: ExtensionModelRequest) => ExtensionModelStream | Promise<ExtensionModelStream>;
export declare interface FileIcon {
    fileIcon: string;
}
declare const FilePicker: ForwardRefExoticComponent<FilePickerProps & RefAttributes<FilePickerRef>>;
declare interface FilePickerProps extends FormItemProps_2<string[]> {
    canChooseFiles?: boolean;
    canChooseDirectories?: boolean;
    showHiddenFiles?: boolean;
    allowMultipleSelection?: boolean;
}
declare type FilePickerRef = FormItemRef;
export declare interface FileSystemItem {
    path: string;
}
export declare const Form: FunctionComponent<FormProps_2> & FormMembers & DeprecatedFormMembers;
export declare namespace Form {
    export type ItemProps<T extends FormValue_2> = FormItemProps_2<T>;
    export type Value = FormValue_2;
    export type Values = FormValues_2;
    export type Props = FormProps_2;
    export type ItemReference = FormItemRef;
    export type Event<T extends FormValue_2> = FormEvent<T>;
    export namespace Event {
        export type Type = FormEventType;
    }
    export type TextField = TextFieldRef;
    export namespace TextField {
        export type Props = TextFieldProps;
    }
    export namespace LinkAccessory {
        export type Props = LinkAccessoryProps;
    }
    export type PasswordField = PasswordFieldRef;
    export namespace PasswordField {
        export type Props = PasswordFieldProps;
    }
    export type TextArea = TextAreaRef;
    export namespace TextArea {
        export type Props = TextAreaProps;
    }
    export namespace Description {
        export type Props = DescriptionProps;
    }
    export namespace Separator {
        export type Props = SeparatorProps;
    }
    export type Checkbox = CheckboxRef;
    export namespace Checkbox {
        export type Props = CheckboxProps;
    }
    export type DatePicker = DatePickerRef;
    export namespace DatePicker {
        export type Props = DatePickerProps;
        export type Type = DatePickerType;
    }
    export type Dropdown = DropdownRef;
    export namespace Dropdown {
        export type Props = DropdownProps;
        export namespace Section {
            export type Props = DropdownSectionProps;
        }
        export namespace Item {
            export type Props = DropdownItemProps;
        }
    }
    export type TagPicker = TagPickerRef;
    export namespace TagPicker {
        export type Props = TagPickerProps;
        export namespace Item {
            export type Props = TagPickerItemProps;
        }
    }
    export type FilePicker = FilePickerRef;
    export namespace FilePicker {
        export type Props = FilePickerProps;
    }
}
export declare const FormCheckbox: typeof Form.Checkbox;
export declare interface FormCheckboxProps extends Form.Checkbox.Props {
}
export declare const FormDatePicker: typeof Form.DatePicker;
export declare interface FormDatePickerProps extends Form.DatePicker.Props {
}
export declare const FormDropdown: typeof Form.Dropdown;
export declare const FormDropdownItem: typeof Form.Dropdown.Item;
export declare interface FormDropdownItemProps extends Form.Dropdown.Item.Props {
}
export declare interface FormDropdownProps extends Form.Dropdown.Props {
}
export declare const FormDropdownSection: typeof Form.Dropdown.Section;
export declare interface FormDropdownSectionProps extends Form.Dropdown.Section.Props {
}
declare type FormEvent<T extends FormValue_2> = {
    target: {
        id: string;
        value?: T;
    };
    type: FormEventType;
};
declare type FormEventType = "focus" | "blur";
export declare interface FormItemProps<Value extends Form.Value> extends Form.ItemProps<Value> {
}
declare interface FormItemProps_2<T extends FormValue_2> {
    id: string;
    title?: string;
    info?: string;
    error?: string;
    storeValue?: boolean;
    autoFocus?: boolean;
    value?: T;
    defaultValue?: T;
    onChange?: (newValue: T) => void;
    onBlur?: (event: FormEvent<T>) => void;
    onFocus?: (event: FormEvent<T>) => void;
}
declare interface FormItemRef {
    focus: () => void;
    reset: () => void;
}
export declare interface FormLaunchProps {
    draftValues?: Form.Values;
}
declare interface FormMembers {
    Checkbox: typeof Checkbox;
    DatePicker: typeof DatePicker;
    Description: typeof Description;
    Dropdown: typeof Dropdown;
    PasswordField: typeof PasswordField;
    Separator: typeof Separator;
    TagPicker: typeof TagPicker;
    TextArea: typeof TextArea;
    TextField: typeof TextField;
    FilePicker: typeof FilePicker;
    LinkAccessory: typeof LinkAccessory;
}
export declare interface FormProps extends Form.Props {
}
declare interface FormProps_2 extends ActionsInterface, NavigationChildInterface {
    enableDrafts?: boolean;
    searchBarAccessory?: ReactElement<LinkAccessoryProps> | undefined | null;
    children?: ReactNode;
}
export declare const FormSeparator: typeof Form.Separator;
export declare interface FormSeparatorProps extends Form.Separator.Props {
}
export declare const FormTagPicker: typeof Form.TagPicker;
export declare const FormTagPickerItem: typeof Form.TagPicker.Item;
export declare interface FormTagPickerItemProps extends Form.TagPicker.Item.Props {
}
export declare interface FormTagPickerProps extends Form.TagPicker.Props {
}
export declare const FormTextArea: typeof Form.TextArea;
export declare interface FormTextAreaProps extends Form.TextArea.Props {
}
export declare const FormTextField: typeof Form.TextField;
export declare interface FormTextFieldProps extends Form.TextField.Props {
}
export declare type FormValue = Form.Value;
declare type FormValue_2 = string | number | boolean | string[] | number[] | Date | null;
export declare interface FormValues extends Form.Values {
}
declare interface FormValues_2 {
    [item: string]: any;
}
export declare function getApplications(path?: PathLike): Promise<Application[]>;
export declare function getDefaultApplication(path: PathLike): Promise<Application>;
export declare function getFrontmostApplication(): Promise<Application>;
export declare const getLocalStorageItem: typeof LocalStorage.getItem;
export declare function getPreferenceValues<Values extends PreferenceValues = PreferenceValues>(): Values;
export declare function getSelectedFinderItems(): Promise<FileSystemItem[]>;
export declare function getSelectedText(): Promise<string>;
export declare const Grid: FunctionComponent<GridProps> & GridMembers;
export declare namespace Grid {
    export type Props = GridProps;
    export type AspectRatio = `${GridAspectRatio}`;
    export type Inset = GridInset;
    export type Fit = GridFit;
    export type ItemSize = GridItemSize;
    export namespace EmptyView {
        export type Props = EmptyViewProps;
    }
    export namespace Dropdown {
        export type Props = DropdownProps_2;
        export namespace Item {
            export type Props = DropdownItemProps_2;
        }
        export namespace Section {
            export type Props = DropdownSectionProps_2;
        }
    }
    export namespace Item {
        export type Accessory = ItemAccessory_2;
        export type Props = ItemProps_2;
    }
    export namespace Section {
        export type Props = SectionProps_3;
    }
}
declare enum GridAspectRatio {
    One = "1",
    ThreeToTwo = "3/2",
    TwoToThree = "2/3",
    FourToThree = "4/3",
    ThreeToFour = "3/4",
    SixteenToNine = "16/9",
    NineToSixteen = "9/16"
}
declare enum GridFit {
    Contain = "contain",
    Fill = "fill"
}
declare enum GridInset {
    Zero = "zero",
    Small = "sm",
    Medium = "md",
    Large = "lg"
}
declare enum GridItemSize {
    Small = "small",
    Medium = "medium",
    Large = "large"
}
declare interface GridMembers {
    Inset: typeof GridInset;
    ItemSize: typeof GridItemSize;
    Fit: typeof GridFit;
    EmptyView: typeof EmptyView;
    Item: typeof Item_2;
    Section: typeof Section_3;
    Dropdown: typeof Dropdown_2;
}
declare interface GridProps extends ActionsInterface, NavigationChildInterface, SearchBarInterface, PaginationInterface {
    actions?: ReactNode;
    children?: ReactNode;
    columns?: number;
    itemSize?: Grid.ItemSize;
    aspectRatio?: Grid.AspectRatio;
    fit?: Grid.Fit;
    inset?: Grid.Inset;
    onSelectionChange?: (id: string | null) => void;
    searchBarAccessory?: ReactElement<DropdownProps_2> | undefined | null;
    searchText?: string;
    enableFiltering?: boolean;
    searchBarPlaceholder?: string;
    selectedItemId?: string;
}
export declare enum Icon {
    AddPerson = "add-person-16",
    Airplane = "airplane-16",
    AirplaneFilled = "airplane-filled-16",
    AirplaneLanding = "airplane-landing-16",
    AirplaneTakeoff = "airplane-takeoff-16",
    Airpods = "airpods-16",
    Alarm = "alarm-16",
    AlarmRinging = "alarm-ringing-16",
    AlignCentre = "align-centre-16",
    AlignLeft = "align-left-16",
    AlignRight = "align-right-16",
    AmericanFootball = "american-football-16",
    Anchor = "anchor-16",
    AppWindow = "app-window-16",
    AppWindowGrid2x2 = "app-window-grid-2x2-16",
    AppWindowGrid3x3 = "app-window-grid-3x3-16",
    AppWindowList = "app-window-list-16",
    AppWindowSidebarLeft = "app-window-sidebar-left-16",
    AppWindowSidebarRight = "app-window-sidebar-right-16",
    ArrowClockwise = "arrow-clockwise-16",
    ArrowCounterClockwise = "arrow-counter-clockwise-16",
    ArrowDown = "arrow-down-16",
    ArrowDownCircle = "arrow-down-circle-16",
    ArrowDownCircleFilled = "arrow-down-circle-filled-16",
    ArrowLeft = "arrow-left-16",
    ArrowLeftCircle = "arrow-left-circle-16",
    ArrowLeftCircleFilled = "arrow-left-circle-filled-16",
    ArrowNe = "arrow-ne-16",
    ArrowRight = "arrow-right-16",
    ArrowRightCircle = "arrow-right-circle-16",
    ArrowRightCircleFilled = "arrow-right-circle-filled-16",
    ArrowUp = "arrow-up-16",
    ArrowUpCircle = "arrow-up-circle-16",
    ArrowUpCircleFilled = "arrow-up-circle-filled-16",
    ArrowsContract = "arrows-contract-16",
    ArrowsExpand = "arrows-expand-16",
    AtSymbol = "at-symbol-16",
    BandAid = "band-aid-16",
    BankNote = "bank-note-16",
    BarChart = "bar-chart-16",
    BarCode = "bar-code-16",
    BathTub = "bath-tub-16",
    Battery = "battery-16",
    BatteryCharging = "battery-charging-16",
    BatteryDisabled = "battery-disabled-16",
    Bell = "bell-16",
    BellDisabled = "bell-disabled-16",
    Bike = "bike-16",
    Binoculars = "binoculars-16",
    Bird = "bird-16",
    BlankDocument = "blank-document-16",
    Bluetooth = "bluetooth-16",
    Boat = "boat-16",
    Bold = "bold-16",
    Bolt = "bolt-16",
    BoltDisabled = "bolt-disabled-16",
    Book = "book-16",
    Bookmark = "bookmark-16",
    Box = "box-16",
    Brush = "brush-16",
    Bubble = "speech-bubble-16",
    Bug = "bug-16",
    Building = "building-16",
    BulletPoints = "bullet-points-16",
    BullsEye = "bulls-eye-16",
    BullsEyeMissed = "bulls-eye-missed-16",
    Buoy = "buoy-16",
    Calculator = "calculator-16",
    Calendar = "calendar-16",
    Camera = "camera-16",
    Car = "car-16",
    Cart = "cart-16",
    Cd = "cd-16",
    Center = "center-16",
    Check = "check-16",
    CheckCircle = "check-circle-16",
    CheckList = "check-list-16",
    CheckRosette = "check-rosette-16",
    Checkmark = "checkmark-16",
    ChessPiece = "chess-piece-16",
    ChevronDown = "chevron-down-16",
    ChevronDownSmall = "chevron-down-small-16",
    ChevronLeft = "chevron-left-16",
    ChevronLeftSmall = "chevron-left-small-16",
    ChevronRight = "chevron-right-16",
    ChevronRightSmall = "chevron-right-small-16",
    ChevronUp = "chevron-up-16",
    ChevronUpDown = "chevron-up-down-16",
    ChevronUpSmall = "chevron-up-small-16",
    Circle = "circle-16",
    CircleDisabled = "circle-disabled-16",
    CircleEllipsis = "circle-ellipsis-16",
    CircleFilled = "circle-filled-16",
    CircleProgress = "circle-progress-16",
    CircleProgress100 = "circle-progress-100-16",
    CircleProgress25 = "circle-progress-25-16",
    CircleProgress50 = "circle-progress-50-16",
    CircleProgress75 = "circle-progress-75-16",
    ClearFormatting = "clear-formatting-16",
    Clipboard = "copy-clipboard-16",
    Clock = "clock-16",
    Cloud = "cloud-16",
    CloudLightning = "cloud-lightning-16",
    CloudRain = "cloud-rain-16",
    CloudSnow = "cloud-snow-16",
    CloudSun = "cloud-sun-16",
    Code = "code-16",
    CodeBlock = "code-block-16",
    Cog = "cog-16",
    Coin = "coin-16",
    Coins = "coins-16",
    CommandSymbol = "command-symbol-16",
    Compass = "compass-16",
    ComputerChip = "computer-chip-16",
    Contrast = "contrast-16",
    CopyClipboard = "copy-clipboard-16",
    CreditCard = "credit-card-16",
    CricketBall = "cricket-ball-16",
    Crop = "crop-16",
    Crown = "crown-16",
    Crypto = "crypto-16",
    DeleteDocument = "delete-document-16",
    Desktop = "desktop-16",
    Devices = "devices-16",
    Dna = "dna-16",
    Document = "blank-document-16",
    Dot = "dot-16",
    Download = "download-16",
    Droplets = "droplets-16",
    Duplicate = "duplicate-16",
    EditShape = "edit-shape-16",
    Eject = "eject-16",
    Ellipsis = "ellipsis-16",
    EllipsisVertical = "ellipsis-vertical-16",
    Emoji = "emoji-16",
    EmojiSad = "emoji-sad-16",
    Envelope = "envelope-16",
    Eraser = "eraser-16",
    ExclamationMark = "important-01-16",
    Exclamationmark = "exclamationmark-16",
    Exclamationmark2 = "exclamationmark-2-16",
    Exclamationmark3 = "exclamationmark-3-16",
    Eye = "eye-16",
    EyeDisabled = "eye-disabled-16",
    EyeDropper = "eye-dropper-16",
    Female = "female-16",
    FilmStrip = "film-strip-16",
    Filter = "filter-16",
    Finder = "finder-16",
    Fingerprint = "fingerprint-16",
    Flag = "flag-16",
    Folder = "folder-16",
    Footprints = "footprints-16",
    Forward = "forward-16",
    ForwardFilled = "forward-filled-16",
    FountainTip = "fountain-tip-16",
    FullSignal = "full-signal-16",
    GameController = "game-controller-16",
    Gauge = "gauge-16",
    Gear = "cog-16",
    Geopin = "geopin-16",
    Germ = "germ-16",
    Gift = "gift-16",
    Glasses = "glasses-16",
    Globe = "globe-01-16",
    Goal = "goal-16",
    Hammer = "hammer-16",
    HardDrive = "hard-drive-16",
    Hashtag = "hashtag-16",
    Heading = "heading-16",
    Headphones = "headphones-16",
    Heart = "heart-16",
    HeartDisabled = "heart-disabled-16",
    Heartbeat = "heartbeat-16",
    Highlight = "highlight-16",
    Hourglass = "hourglass-16",
    House = "house-16",
    Humidity = "humidity-16",
    Image = "image-16",
    Important = "important-01-16",
    Info = "info-01-16",
    Italics = "italics-16",
    Key = "key-16",
    Keyboard = "keyboard-16",
    Layers = "layers-16",
    Leaderboard = "leaderboard-16",
    Leaf = "leaf-16",
    LevelMeter = "signal-2-16",
    LightBulb = "light-bulb-16",
    LightBulbOff = "light-bulb-off-16",
    LineChart = "line-chart-16",
    Link = "link-16",
    List = "app-window-list-16",
    Livestream = "livestream-01-16",
    LivestreamDisabled = "livestream-disabled-01-16",
    Lock = "lock-16",
    LockDisabled = "lock-disabled-16",
    LockUnlocked = "lock-unlocked-16",
    Logout = "logout-16",
    Lorry = "lorry-16",
    Lowercase = "lowercase-16",
    MagnifyingGlass = "magnifying-glass-16",
    Male = "male-16",
    Map = "map-16",
    Mask = "mask-16",
    Maximize = "maximize-16",
    MedicalSupport = "medical-support-16",
    Megaphone = "megaphone-16",
    MemoryChip = "computer-chip-16",
    MemoryStick = "memory-stick-16",
    Message = "speech-bubble-16",
    Microphone = "microphone-16",
    MicrophoneDisabled = "microphone-disabled-16",
    Minimize = "minimize-16",
    Minus = "minus-16",
    MinusCircle = "minus-circle-16",
    MinusCircleFilled = "minus-circle-filled-16",
    Mobile = "mobile-16",
    Monitor = "monitor-16",
    Moon = "moon-16",
    MoonDown = "moon-down-16",
    MoonUp = "moon-up-16",
    Moonrise = "moonrise-16",
    Mountain = "mountain-16",
    Mouse = "mouse-16",
    Move = "move-16",
    Mug = "mug-16",
    MugSteam = "mug-steam-16",
    Multiply = "multiply-16",
    Music = "music-16",
    Network = "network-16",
    NewDocument = "new-document-16",
    NewFolder = "new-folder-16",
    Number00 = "number-00-16",
    Number01 = "number-01-16",
    Number02 = "number-02-16",
    Number03 = "number-03-16",
    Number04 = "number-04-16",
    Number05 = "number-05-16",
    Number06 = "number-06-16",
    Number07 = "number-07-16",
    Number08 = "number-08-16",
    Number09 = "number-09-16",
    Number10 = "number-10-16",
    Number11 = "number-11-16",
    Number12 = "number-12-16",
    Number13 = "number-13-16",
    Number14 = "number-14-16",
    Number15 = "number-15-16",
    Number16 = "number-16-16",
    Number17 = "number-17-16",
    Number18 = "number-18-16",
    Number19 = "number-19-16",
    Number20 = "number-20-16",
    Number21 = "number-21-16",
    Number22 = "number-22-16",
    Number23 = "number-23-16",
    Number24 = "number-24-16",
    Number25 = "number-25-16",
    Number26 = "number-26-16",
    Number27 = "number-27-16",
    Number28 = "number-28-16",
    Number29 = "number-29-16",
    Number30 = "number-30-16",
    Number31 = "number-31-16",
    Number32 = "number-32-16",
    Number33 = "number-33-16",
    Number34 = "number-34-16",
    Number35 = "number-35-16",
    Number36 = "number-36-16",
    Number37 = "number-37-16",
    Number38 = "number-38-16",
    Number39 = "number-39-16",
    Number40 = "number-40-16",
    Number41 = "number-41-16",
    Number42 = "number-42-16",
    Number43 = "number-43-16",
    Number44 = "number-44-16",
    Number45 = "number-45-16",
    Number46 = "number-46-16",
    Number47 = "number-47-16",
    Number48 = "number-48-16",
    Number49 = "number-49-16",
    Number50 = "number-50-16",
    Number51 = "number-51-16",
    Number52 = "number-52-16",
    Number53 = "number-53-16",
    Number54 = "number-54-16",
    Number55 = "number-55-16",
    Number56 = "number-56-16",
    Number57 = "number-57-16",
    Number58 = "number-58-16",
    Number59 = "number-59-16",
    Number60 = "number-60-16",
    Number61 = "number-61-16",
    Number62 = "number-62-16",
    Number63 = "number-63-16",
    Number64 = "number-64-16",
    Number65 = "number-65-16",
    Number66 = "number-66-16",
    Number67 = "number-67-16",
    Number68 = "number-68-16",
    Number69 = "number-69-16",
    Number70 = "number-70-16",
    Number71 = "number-71-16",
    Number72 = "number-72-16",
    Number73 = "number-73-16",
    Number74 = "number-74-16",
    Number75 = "number-75-16",
    Number76 = "number-76-16",
    Number77 = "number-77-16",
    Number78 = "number-78-16",
    Number79 = "number-79-16",
    Number80 = "number-80-16",
    Number81 = "number-81-16",
    Number82 = "number-82-16",
    Number83 = "number-83-16",
    Number84 = "number-84-16",
    Number85 = "number-85-16",
    Number86 = "number-86-16",
    Number87 = "number-87-16",
    Number88 = "number-88-16",
    Number89 = "number-89-16",
    Number90 = "number-90-16",
    Number91 = "number-91-16",
    Number92 = "number-92-16",
    Number93 = "number-93-16",
    Number94 = "number-94-16",
    Number95 = "number-95-16",
    Number96 = "number-96-16",
    Number97 = "number-97-16",
    Number98 = "number-98-16",
    Number99 = "number-99-16",
    NumberList = "number-list-16",
    Paperclip = "paperclip-16",
    Paragraph = "paragraph-16",
    Patch = "patch-16",
    Pause = "pause-16",
    PauseFilled = "pause-filled-16",
    Pencil = "pencil-16",
    Person = "person-16",
    PersonCircle = "person-circle-16",
    PersonLines = "person-lines-16",
    Phone = "phone-16",
    PhoneRinging = "phone-ringing-16",
    PieChart = "pie-chart-16",
    Pill = "pill-16",
    Pin = "pin-16",
    PinDisabled = "pin-disabled-16",
    Play = "play-16",
    PlayFilled = "play-filled-16",
    Plug = "plug-16",
    Plus = "plus-16",
    PlusCircle = "plus-circle-16",
    PlusCircleFilled = "plus-circle-filled-16",
    PlusMinusDivideMultiply = "plus-minus-divide-multiply-16",
    PlusSquare = "plus-square-16",
    PlusTopRightSquare = "plus-top-right-square-16",
    Power = "power-16",
    Print = "print-16",
    QuestionMark = "question-mark-circle-16",
    QuestionMarkCircle = "question-mark-circle-16",
    Quicklink = "quicklink-16",
    QuotationMarks = "quotation-marks-16",
    QuoteBlock = "quote-block-16",
    Racket = "racket-16",
    Raindrop = "raindrop-16",
    RaycastLogoNeg = "raycast-logo-neg-16",
    RaycastLogoPos = "raycast-logo-pos-16",
    Receipt = "receipt-16",
    Redo = "redo-16",
    RemovePerson = "remove-person-16",
    Repeat = "repeat-16",
    Replace = "replace-16",
    ReplaceOne = "replace-one-16",
    Reply = "reply-16",
    Rewind = "rewind-16",
    RewindFilled = "rewind-filled-16",
    Rocket = "rocket-16",
    Rosette = "rosette-16",
    RotateAntiClockwise = "rotate-anti-clockwise-16",
    RotateClockwise = "rotate-clockwise-16",
    Rss = "rss-16",
    Ruler = "ruler-16",
    SaveDocument = "save-document-16",
    Shield = "shield-01-16",
    ShortParagraph = "short-paragraph-16",
    Shuffle = "shuffle-16",
    Sidebar = "app-window-sidebar-right-16",
    Signal0 = "signal-0-16",
    Signal1 = "signal-1-16",
    Signal2 = "signal-2-16",
    Signal3 = "signal-3-16",
    Snippets = "snippets-16",
    Snowflake = "snowflake-16",
    SoccerBall = "soccer-ball-16",
    Speaker = "speaker-16",
    SpeakerDown = "speaker-down-16",
    SpeakerHigh = "speaker-high-16",
    SpeakerLow = "speaker-low-16",
    SpeakerOff = "speaker-off-16",
    SpeakerOn = "speaker-on-16",
    SpeakerUp = "speaker-up-16",
    SpeechBubble = "speech-bubble-16",
    SpeechBubbleActive = "speech-bubble-active-16",
    SpeechBubbleImportant = "speech-bubble-important-16",
    SquareEllipsis = "square-ellipsis-16",
    StackedBars1 = "stacked-bars-1-16",
    StackedBars2 = "stacked-bars-2-16",
    StackedBars3 = "stacked-bars-3-16",
    StackedBars4 = "stacked-bars-4-16",
    Star = "star-16",
    StarCircle = "star-circle-16",
    StarDisabled = "star-disabled-16",
    Stars = "stars-16",
    Stop = "stop-16",
    StopFilled = "stop-filled-16",
    Stopwatch = "stopwatch-16",
    Store = "store-16",
    StrikeThrough = "strike-through-16",
    Sun = "sun-16",
    Sunrise = "sunrise-16",
    Swatch = "swatch-16",
    Switch = "switch-16",
    Syringe = "syringe-16",
    Tack = "tack-16",
    TackDisabled = "tack-disabled-16",
    Tag = "tag-16",
    Temperature = "temperature-16",
    TennisBall = "tennis-ball-16",
    Terminal = "terminal-16",
    Text = "text-16",
    TextCursor = "text-cursor-16",
    TextInput = "text-input-16",
    TextSelection = "text-selection-16",
    ThumbsDown = "thumbs-down-16",
    ThumbsDownFilled = "thumbs-down-filled-16",
    ThumbsUp = "thumbs-up-16",
    ThumbsUpFilled = "thumbs-up-filled-16",
    Ticket = "ticket-16",
    Torch = "torch-16",
    Train = "train-16",
    Trash = "trash-16",
    Tray = "tray-16",
    Tree = "tree-16",
    Trophy = "trophy-16",
    TwoPeople = "two-people-16",
    Umbrella = "umbrella-16",
    Underline = "underline-16",
    Undo = "undo-16",
    Upload = "upload-16",
    Uppercase = "uppercase-16",
    Video = "video-16",
    VideoDisabled = "video-disabled-16",
    Wallet = "wallet-16",
    Wand = "wand-16",
    Warning = "warning-16",
    Waveform = "waveform-16",
    Weights = "weights-16",
    Wifi = "wifi-16",
    WifiDisabled = "wifi-disabled-16",
    Wind = "wind-16",
    Window = "app-window-16",
    Windsock = "windsock-16",
    WrenchScrewdriver = "wrench-screwdriver-16",
    WristWatch = "wrist-watch-16",
    XMarkCircle = "x-mark-circle-16",
    XMarkCircleFilled = "x-mark-circle-filled-16",
    XMarkCircleHalfDash = "x-mark-circle-half-dash-16",
    XMarkTopRightSquare = "x-mark-top-right-square-16",
    Xmark = "xmark-16",
    TwoArrowsClockwise = "arrow-clockwise-16",
    EyeSlash = "eye-disabled-16",
    SpeakerArrowDown = "speaker-down-16",
    SpeakerArrowUp = "speaker-up-16",
    SpeakerSlash = "speaker-off-16",
    TextDocument = "blank-document-16",
    XmarkCircle = "x-mark-circle-16"
}
export declare interface Image {
    source: Image.Source;
    fallback?: Image.Fallback | undefined | null;
    mask?: Image.Mask | undefined | null;
    tintColor?: Color.ColorLike | undefined | null;
}
export declare namespace Image {
    export type URL = string;
    export type Asset = string;
    export type ImageLike = URL | Asset | Icon | FileIcon | Image;
    export type Source = URL | Asset | Icon | {
        light: URL | Asset;
        dark: URL | Asset;
    };
    export type Fallback = Asset | Icon | {
        light: Asset;
        dark: Asset;
    };
    export enum Mask {
        Circle = "circle",
        RoundedRectangle = "roundedRectangle"
    }
}
export declare type ImageLike = Image.ImageLike;
export declare type ImageMask = Image.Mask;
export declare const ImageMask: typeof Image.Mask;
export declare type ImageSource = Image.Source;
declare const InstallMCPServer: FunctionComponent<InstallMCPServerProps>;
declare interface InstallMCPServerProps {
    server: StdioMCPServer | SSEMCPServer;
    title?: string;
    icon?: Image.ImageLike;
    shortcut?: Keyboard.Shortcut;
}
declare type InterExtensionLaunchOptions = {
    ownerOrAuthorName: string;
    extensionName: string;
    name: string;
    type: LaunchType;
    arguments?: Arguments | null;
    context?: LaunchContext | null;
    fallbackText?: string | null;
};
declare type IntraExtensionLaunchOptions = {
    name: string;
    type: LaunchType;
    arguments?: Arguments | null;
    context?: LaunchContext | null;
    fallbackText?: string | null;
};
declare const Item: FunctionComponent<ItemProps> & ItemMembers;
declare const Item_2: FunctionComponent<ItemProps_2>;
declare const Item_3: FunctionComponent<ItemProps_3>;
declare type ItemAccessory = ({
    text?: string | undefined | null | {
        value: string | undefined | null;
        color?: Color;
    };
} | {
    date?: Date | undefined | null | {
        value: Date | undefined | null;
        color?: Color;
    };
} | {
    tag: string | Date | undefined | null | {
        value: string | Date | undefined | null;
        color?: Color.ColorLike;
    };
}) & {
    icon?: Image.ImageLike | undefined | null;
    tooltip?: string | undefined | null;
};
declare type ItemAccessory_2 = {
    icon?: Image.ImageLike | undefined | null;
    tooltip?: string | undefined | null;
};
declare interface ItemActionEvent {
    type: "left-click" | "right-click";
}
declare interface ItemMembers {
    Detail: typeof Detail_2;
}
declare interface ItemProps extends ActionsInterface {
    id?: string;
    title: string | {
        value: string;
        tooltip?: string | null;
    };
    subtitle?: string | {
        value?: string | null;
        tooltip?: string | null;
    };
    keywords?: string[];
    icon?: Image.ImageLike | {
        value: Image.ImageLike | undefined | null;
        tooltip: string;
    };
    accessoryIcon?: Image.ImageLike;
    accessoryTitle?: string;
    accessories?: ItemAccessory[] | undefined | null;
    actions?: ReactNode | null;
    detail?: ReactNode;
    quickLook?: {
        name?: string | null;
        path: PathLike;
    };
}
declare interface ItemProps_2 extends ActionsInterface {
    id?: string;
    content: Image.ImageLike | {
        color: Color.ColorLike;
    } | {
        value: Image.ImageLike | {
            color: Color.ColorLike;
        };
        tooltip: string;
    };
    title?: string;
    subtitle?: string;
    keywords?: string[];
    accessory?: ItemAccessory_2;
    quickLook?: {
        name?: string | null;
        path: PathLike;
    };
    actions?: ReactNode | null;
}
declare interface ItemProps_3 {
    title: string;
    subtitle?: string;
    icon?: Image.ImageLike;
    tooltip?: string;
    onAction?: (event: ItemActionEvent) => void;
    shortcut?: Keyboard.Shortcut;
    alternate?: ReactElement<ItemProps_3>;
}
declare type JSONArray = JSONValue[];
declare type JSONObject = {
    [key: string]: JSONValue | undefined;
};
declare type JSONValue = null | string | number | boolean | JSONObject | JSONArray;
export declare namespace Keyboard {
    export type Shortcut = {
        modifiers: KeyModifier[];
        key: KeyEquivalent;
    } | {
        Windows: {
            modifiers: KeyModifier[];
            key: KeyEquivalent;
        };
        windows?: {
            modifiers: KeyModifier[];
            key: KeyEquivalent;
        };
        macOS: {
            modifiers: KeyModifier[];
            key: KeyEquivalent;
        };
    };
    export namespace Shortcut {
        const Common: {
            Copy: Shortcut;
            CopyDeeplink: Shortcut;
            CopyName: Shortcut;
            CopyPath: Shortcut;
            Save: Shortcut;
            Duplicate: Shortcut;
            Edit: Shortcut;
            MoveDown: Shortcut;
            MoveUp: Shortcut;
            New: Shortcut;
            Open: Shortcut;
            OpenWith: Shortcut;
            Pin: Shortcut;
            Refresh: Shortcut;
            Remove: Shortcut;
            RemoveAll: Shortcut;
            ToggleQuickLook: Shortcut;
        };
    }
    export type KeyModifier = "cmd" | "ctrl" | "opt" | "shift" | "alt" | "windows";
    export type KeyEquivalent = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "," | ";" | "=" | "+" | "-" | "[" | "]" | "{" | "}" | "«" | "»" | "(" | ")" | "/" | "\\" | "'" | "`" | "§" | "^" | "@" | "$" | "return" | "delete" | "deleteForward" | "tab" | "arrowUp" | "arrowDown" | "arrowLeft" | "arrowRight" | "pageUp" | "pageDown" | "home" | "end" | "space" | "escape" | "enter" | "backspace";
}
export declare type KeyboardShortcut = Keyboard.Shortcut;
export declare type KeyEquivalent = Keyboard.KeyEquivalent;
export declare type KeyModifier = Keyboard.KeyModifier;
declare const Label: FunctionComponent<LabelProps>;
declare interface LabelProps {
    title: string;
    icon?: Image.ImageLike | undefined | null;
    text?: string | {
        value: string;
        color?: Color | null;
    };
}
 export declare function launchCommand(options: LaunchOptions): Promise<void>;
 declare interface LaunchContext {
     [item: string]: any;
 }
 declare type LaunchOptions = IntraExtensionLaunchOptions | InterExtensionLaunchOptions;
 export declare type LaunchProps<T extends {
     arguments?: Arguments;
     draftValues?: Form.Values;
     launchContext?: LaunchContext;
 } = {
     arguments: Arguments;
     draftValues: Form.Values;
     launchContext?: LaunchContext;
 }> = {
     launchType: LaunchType;
     arguments: T["arguments"];
     draftValues?: T["draftValues"];
     launchContext?: T["launchContext"];
     fallbackText?: string;
 };
 export declare enum LaunchType {
     UserInitiated = "userInitiated",
     Background = "background"
 }
 declare const Link: FunctionComponent<LinkProps>;
 declare const LinkAccessory: FunctionComponent<LinkAccessoryProps>;
 declare interface LinkAccessoryProps {
     target: string;
     text: string;
 }
 declare interface LinkProps {
     title: string;
     target: string;
     text: string;
 }
 export declare const List: FunctionComponent<ListProps_2> & ListMembers;
 export declare namespace List {
     export type Props = ListProps_2;
     export namespace EmptyView {
         export type Props = EmptyViewProps;
     }
     export namespace Dropdown {
         export type Props = DropdownProps_2;
         export namespace Item {
             export type Props = DropdownItemProps_2;
         }
         export namespace Section {
             export type Props = DropdownSectionProps_2;
         }
     }
     export namespace Item {
         export type Accessory = ItemAccessory;
         export type Props = ItemProps;
         export namespace Detail {
             export type Props = DetailProps_3;
             export namespace Metadata {
                 export type Props = MetadataProps;
                 export namespace Label {
                     export type Props = LabelProps;
                 }
                 export namespace Separator {
                     export type Props = SeparatorProps_2;
                 }
                 export namespace Link {
                     export type Props = LinkProps;
                 }
                 export namespace TagList {
                     export type Props = TagListProps;
                     export namespace Item {
                         export type Props = TagListItemProps;
                     }
                 }
             }
         }
     }
     export namespace Section {
         export type Props = SectionProps_2;
     }
 }
 export declare const ListItem: typeof List.Item;
 export declare interface ListItemProps extends List.Item.Props {
 }
 declare interface ListMembers {
     EmptyView: typeof EmptyView;
     Item: typeof Item;
     Section: typeof Section_2;
     Dropdown: typeof Dropdown_2;
 }
 export declare interface ListProps extends List.Props {
 }
 declare interface ListProps_2 extends ActionsInterface, NavigationChildInterface, SearchBarInterface, PaginationInterface {
     actions?: ReactNode;
     children?: ReactNode;
     onSelectionChange?: (id: string | null) => void;
     searchBarAccessory?: ReactElement<DropdownProps_2> | undefined | null;
     searchText?: string;
     enableFiltering?: boolean;
     searchBarPlaceholder?: string;
     selectedItemId?: string;
     isShowingDetail?: boolean;
 }
 export declare const ListSection: typeof List.Section;
 export declare interface ListSectionProps extends List.Section.Props {
 }
 export declare namespace LocalStorage {
     export function allItems<T extends Values = Values>(): Promise<T>;
     export function getItem<T extends Value = Value>(key: string): Promise<T | undefined>;
     export function setItem(key: string, value: Value): Promise<void>;
     export function removeItem(key: string): Promise<void>;
     export function clear(): Promise<void>;
     export type Value = string | number | boolean;
     export interface Values {
         [key: string]: any;
     }
 }
 export declare type LocalStorageValue = LocalStorage.Value;
 export declare interface LocalStorageValues extends LocalStorage.Values {
 }
 declare interface MCPServer {
     icon?: Icon;
     name: string;
     description?: string;
 }
 export declare const MenuBarExtra: FunctionComponent<MenuBarExtraProps> & MenuBarExtraMembers;
 export declare namespace MenuBarExtra {
     export type Props = MenuBarExtraProps;
     export type ActionEvent = ItemActionEvent;
     export namespace Item {
         export type Props = ItemProps_3;
     }
     export namespace Section {
         export type Props = SectionProps_4;
     }
     export namespace Submenu {
         export type Props = SubmenuProps_2;
     }
 }
 declare interface MenuBarExtraMembers {
     Item: typeof Item_3;
     Separator: typeof Separator_3;
     Submenu: typeof Submenu_2;
     Section: typeof Section_4;
 }
 declare interface MenuBarExtraProps {
     isLoading?: boolean;
     title?: string;
     tooltip?: string;
     icon?: Image.ImageLike;
     children?: ReactNode;
 }
 declare const Metadata: FunctionComponent<MetadataProps> & MetadataMembers;
 declare interface MetadataMembers {
     Label: typeof Label;
     Separator: typeof Separator_2;
     Link: typeof Link;
     TagList: typeof TagList;
 }
 declare interface MetadataProps {
     children: ReactNode;
 }
 export declare interface Navigation {
     push: (component: ReactNode, onPop?: () => void) => void;
     pop: () => void;
 }
 declare interface NavigationChildInterface {
     navigationTitle?: string;
     isLoading?: boolean;
 }
 declare type NoulAnswer = {
     type: "noul";
     noul: number;
 };
 declare type NoulQuestion = {
     type: "noul";
     instructions: string;
 };
 export declare namespace OAuth {
     const clientIdMetadataDocument = "https://www.raycast.com/.well-known/oauth-client-metadata/raycast.json";
     export namespace PKCEClient {
         export interface Options<TRedirectMethod extends RedirectMethod = RedirectMethod> {
             redirectMethod: TRedirectMethod;
             providerName: string;
             providerIcon?: Image.ImageLike;
             providerId?: string;
             description?: string;
         }
     }
     export class PKCEClient<TRedirectMethod extends RedirectMethod = RedirectMethod> {
         redirectMethod: TRedirectMethod;
         providerName: string;
         providerIcon?: Image.ImageLike;
         providerId: string;
         description?: string;
         private resolvesOnRedirect?;
         private isAuthorizing;
         constructor(options: PKCEClient.Options<TRedirectMethod>);
         authorizationRequest(this: PKCEClient<RedirectMethod.ClientIdMetadataDocument>, options: ClientIdMetadataDocumentAuthorizationRequestOptions): Promise<AuthorizationRequest>;
         authorizationRequest(options: AuthorizationRequestOptions): Promise<AuthorizationRequest>;
         private resolveClientId;
         authorize(options: AuthorizationRequest | AuthorizationOptions): Promise<AuthorizationResponse>;
         private authorizationURL;
         setTokens(options: TokenSetOptions | TokenResponse): Promise<void>;
         getTokens(): Promise<TokenSet | undefined>;
         removeTokens(): Promise<void>;
     }
     export enum RedirectMethod {
         Web = "web",
         App = "app",
         AppURI = "appURI",
         ClientIdMetadataDocument = "clientIdMetadataDocument"
     }
     export interface AuthorizationRequestOptions {
         endpoint: string;
         clientId: string;
         scope: string;
         extraParameters?: {
             [key: string]: string;
         };
     }
     export interface ClientIdMetadataDocumentAuthorizationRequestOptions extends Omit<AuthorizationRequestOptions, "clientId"> {
         clientId?: string;
     }
     export interface AuthorizationRequestURLParams {
         clientId?: string;
         codeChallenge: string;
         codeVerifier: string;
         state: string;
         redirectURI: string;
     }
     export interface AuthorizationRequest extends AuthorizationRequestURLParams {
         clientId: string;
         toURL(): string;
     }
     export interface AuthorizationOptions {
         url: string;
     }
     export interface AuthorizationResponse {
         authorizationCode: string;
     }
     export interface TokenSet {
         accessToken: string;
         refreshToken?: string;
         idToken?: string;
         expiresIn?: number;
         scope?: string;
         updatedAt: Date;
         isExpired(): boolean;
     }
     export interface TokenSetOptions {
         accessToken: string;
         refreshToken?: string;
         idToken?: string;
         expiresIn?: number;
         scope?: string | string[];
     }
     export interface TokenResponse {
         access_token: string;
         refresh_token?: string;
         id_token?: string;
         expires_in?: number;
         scope?: string | string[];
     }
 }
 declare const Open: FunctionComponent<OpenProps>;
 export declare function open(target: string, application?: Application | string): Promise<void>;
 export declare const OpenAction: FunctionComponent<OpenProps>;
 export declare interface OpenActionProps extends Action.Open.Props {
 }
 export declare function openCommandPreferences(): Promise<void>;
 export declare function openExtensionPreferences(): Promise<void>;
 declare const OpenInBrowser: FunctionComponent<OpenInBrowserProps>;
 export declare const OpenInBrowserAction: FunctionComponent<OpenInBrowserProps>;
 export declare interface OpenInBrowserActionProps extends Action.OpenInBrowser.Props {
 }
 declare interface OpenInBrowserProps {
     url: string;
     title?: string;
     icon?: Image.ImageLike;
     shortcut?: Keyboard.Shortcut;
     onOpen?: (url: string) => void;
 }
 declare interface OpenProps {
     target: string;
     application?: Application | string;
     title: string;
     icon?: Image.ImageLike;
     shortcut?: Keyboard.Shortcut;
     onOpen?: (target: string) => void;
 }
 declare const OpenWith: FunctionComponent<OpenWithProps>;
 export declare const OpenWithAction: FunctionComponent<OpenWithProps>;
 export declare interface OpenWithActionProps extends Action.OpenWith.Props {
 }
 declare interface OpenWithProps {
     path: string;
     title?: string;
     icon?: Image.ImageLike;
     shortcut?: Keyboard.Shortcut;
     onOpen?: (path: string) => void;
 }
 declare interface PaginationInterface {
     pagination?: {
         pageSize: number;
         hasMore: boolean;
         onLoadMore: () => void;
     };
 }
 declare const PasswordField: ForwardRefExoticComponent<PasswordFieldProps & RefAttributes<PasswordFieldRef>>;
 declare interface PasswordFieldProps extends FormItemProps_2<string> {
     placeholder?: string;
 }
 declare type PasswordFieldRef = FormItemRef;
 declare const Paste: FunctionComponent<PasteProps>;
 export declare const PasteAction: FunctionComponent<PasteProps>;
 export declare interface PasteActionProps extends Action.Paste.Props {
 }
 declare interface PasteProps {
     content: string | number | Clipboard.Content;
     title?: string;
     icon?: Image.ImageLike;
     shortcut?: Keyboard.Shortcut;
     onPaste?: (content: string | number | Clipboard.Content) => void;
 }
 export declare const pasteText: typeof Clipboard.paste;
 declare const PickDate: FunctionComponent<PickDateProps> & DatePickerMembers_2;
 declare interface PickDateProps {
     title: string;
     icon?: Image.ImageLike;
     shortcut?: Keyboard.Shortcut;
     onChange: (date: Date | null) => void;
     type?: DatePickerType_2;
     min?: Date;
     max?: Date;
 }
 export declare function popToRoot(options?: {
     clearSearchBar?: boolean;
 }): Promise<void>;
 export declare enum PopToRootType {
     Default = "default",
     Immediate = "immediate",
     Suspended = "suspended"
 }
 export declare interface Preference extends Preference_2 {
 }
 declare interface Preference_2 {
     name: string;
     type: "appPicker" | "checkbox" | "dropdown" | "password" | "textfield" | "file" | "directory";
     required: boolean;
     title: string;
     description: string;
     value?: unknown;
     default?: unknown;
     placeholder?: string;
     label?: string;
     data?: unknown[];
 }
 export declare type Preferences = Preferences_2;
 export declare const preferences: Preferences;
 declare type Preferences_2 = Record<string, Preference_2>;
 export declare interface PreferenceValues {
     [name: string]: any;
 }
 declare const Push: FunctionComponent<PushProps>;
 export declare const PushAction: FunctionComponent<PushProps>;
 export declare interface PushActionProps extends Action.Push.Props {
 }
 declare interface PushProps {
     title: string;
     target: ReactNode;
     icon?: Image.ImageLike;
     shortcut?: Keyboard.Shortcut;
     onPush?: () => void;
     onPop?: () => void;
 }
 declare interface Quicklink {
     icon?: Icon;
     link: string;
     name?: string;
     application?: string | Application;
 }
 export declare const randomId: any;
 export declare const removeLocalStorageItem: typeof LocalStorage.removeItem;
 export declare const render: any;
 declare type ScoreAnswer = {
     type: "score";
     score: number;
     confidence: number;
     legend: Record<string, string>;
     probabilities: Record<string, number>;
 };
 declare type ScoreQuestion = {
     type: "score";
     instructions: string;
     criteria: readonly string[];
 };
 declare interface SearchBarInterface {
     filtering?: boolean | {
         keepSectionOrder: boolean;
     };
     isLoading?: boolean;
     throttle?: boolean;
     onSearchTextChange?: (text: string) => void;
 }
 declare const Section: FunctionComponent<SectionProps>;
 declare const Section_2: FunctionComponent<SectionProps_2>;
 declare const Section_3: FunctionComponent<SectionProps_3>;
 declare const Section_4: FunctionComponent<SectionProps_4>;
 declare type SectionChildren = ReactElement<ActionProps> | ReactElement<ActionProps>[] | ReactElement<SubmenuProps> | Array<ReactElement<SubmenuProps>> | Array<ReactElement<SubmenuProps> | ReactElement<ActionProps>> | null;
 declare interface SectionProps {
     children?: ReactNode;
     title?: string;
 }
 declare interface SectionProps_2 {
     children?: ReactNode;
     id?: string;
     title?: string;
     subtitle?: string;
 }
 declare interface SectionProps_3 {
     children?: ReactNode;
     title?: string;
     subtitle?: string;
     columns?: number;
     aspectRatio?: `${GridAspectRatio}`;
     fit?: GridFit;
     inset?: GridInset;
 }
 declare interface SectionProps_4 {
     children?: ReactNode;
     title?: string;
 }
 declare const Separator: FunctionComponent<SeparatorProps>;
 declare const Separator_2: FunctionComponent<SeparatorProps_2>;
 declare const Separator_3: FunctionComponent<SeparatorProps_3>;
 declare interface SeparatorProps {
 }
 declare interface SeparatorProps_2 {
 }
 declare interface SeparatorProps_3 {
 }
 export declare const setLocalStorageItem: typeof LocalStorage.setItem;
 export declare function showHUD(title: string, options?: {
     clearRootSearch?: boolean;
     popToRootType?: PopToRootType;
 }): Promise<void>;
 declare const ShowInFinder: FunctionComponent<ShowInFinderProps>;
 export declare function showInFinder(path: PathLike): Promise<void>;
 export declare const ShowInFinderAction: FunctionComponent<ShowInFinderProps>;
 export declare interface ShowInFinderActionProps extends Action.ShowInFinder.Props {
 }
 declare interface ShowInFinderProps {
     path: PathLike;
     title?: string;
     icon?: Image.ImageLike;
     shortcut?: Keyboard.Shortcut;
     onShow?: (path: PathLike) => void;
 }
 export declare function showToast(options: Toast.Options): Promise<Toast>;
 export declare function showToast(style: Toast.Style, title: string, message?: string): Promise<Toast>;
 declare interface Snippet {
     text: string;
     name?: string;
     keyword?: string;
 }
 export declare const specialKeys: {
     return: string;
     delete: string;
     deleteForward: string;
     tab: string;
     arrowUp: string;
     arrowDown: string;
     arrowLeft: string;
     arrowRight: string;
     pageUp: string;
     pageDown: string;
     home: string;
     end: string;
     space: string;
     escape: string;
     enter: string;
     backspace: string;
 };
 declare interface SSEMCPServer extends MCPServer {
     transport: "sse";
     url: string;
     headers?: Record<string, string>;
 }
 declare interface StdioMCPServer extends MCPServer {
     transport: "stdio";
     command: string;
     args?: string[];
     env?: Record<string, string>;
 }
 declare const Submenu: FunctionComponent<SubmenuProps>;
 declare const Submenu_2: FunctionComponent<SubmenuProps_2>;
 declare type SubmenuChildren = ReactElement<SectionProps> | ReactElement<SectionProps>[] | SectionChildren | null;
 declare interface SubmenuProps extends SearchBarInterface {
     id?: string;
     title: string;
     icon?: Image.ImageLike;
     shortcut?: Keyboard.Shortcut;
     children?: ReactNode;
     onOpen?: () => void;
     autoFocus?: boolean;
 }
 declare interface SubmenuProps_2 {
     title: string;
     icon?: Image.ImageLike;
     children?: ReactNode;
 }
 declare const SubmitForm: {
     <T extends Form.Values>(props: SubmitFormProps<T>): JSX.Element;
     displayName: string;
 };
 export declare const SubmitFormAction: {
     <T extends Form.Values>(props: SubmitFormProps<T>): JSX.Element;
     displayName: string;
 };
 export declare interface SubmitFormActionProps<T extends Form.Values> extends Action.SubmitForm.Props<T> {
 }
 declare interface SubmitFormProps<T extends Form.Values> {
     title?: string;
     icon?: Image.ImageLike;
     shortcut?: Keyboard.Shortcut;
     style?: Action.Style;
     onSubmit?: (input: T) => void | boolean | Promise<void | boolean>;
 }
 declare const TagList: FunctionComponent<TagListProps> & TagListMembers;
 declare const TagListItem: FunctionComponent<TagListItemProps>;
 declare interface TagListItemProps {
     icon?: Image.ImageLike | undefined | null;
     text?: string;
     color?: Color.ColorLike | undefined | null;
     onAction?: () => void;
 }
 declare interface TagListMembers {
     Item: typeof TagListItem;
 }
 declare interface TagListProps {
     title: string;
     children: ReactNode;
 }
 declare const TagPicker: ForwardRefExoticComponent<TagPickerProps & RefAttributes<TagPickerRef>> & TagPickerMembers;
 declare const TagPickerItem: FunctionComponent<TagPickerItemProps>;
 declare interface TagPickerItemProps {
     value: string;
     title: string;
     icon?: Image.ImageLike;
 }
 declare interface TagPickerMembers {
     Item: typeof TagPickerItem;
 }
 declare interface TagPickerProps extends FormItemProps_2<string[]> {
     children?: ReactNode;
     placeholder?: string;
 }
 declare type TagPickerRef = FormItemRef;
 declare const TextArea: ForwardRefExoticComponent<TextAreaProps & RefAttributes<TextAreaRef>>;
 declare interface TextAreaProps extends FormItemProps_2<string> {
     placeholder?: string;
     enableMarkdown?: boolean;
 }
 declare type TextAreaRef = FormItemRef;
 declare const TextField: ForwardRefExoticComponent<TextFieldProps & RefAttributes<TextFieldRef>>;
 declare interface TextFieldProps extends FormItemProps_2<string> {
     placeholder?: string;
 }
 declare type TextFieldRef = FormItemRef;
 export declare class Toast {
     private options;
     private id;
     private callbacks;
     private pendingRequest;
     constructor(props: Toast.Options);
     get style(): Toast.Style;
     set style(style: Toast.Style);
     get title(): string;
     set title(title: string);
     get message(): string | undefined;
     set message(message: string | undefined);
     get primaryAction(): Toast.ActionOptions | undefined;
     set primaryAction(action: Toast.ActionOptions | undefined);
     get secondaryAction(): Toast.ActionOptions | undefined;
     set secondaryAction(action: Toast.ActionOptions | undefined);
     show(): Promise<void>;
     hide(): Promise<void>;
     private update;
     private enqueueRequest;
     private getRequestOptions;
 }
 export declare namespace Toast {
     export interface Options {
         title: string;
         message?: string;
         style?: Style;
         primaryAction?: ActionOptions;
         secondaryAction?: ActionOptions;
     }
     export interface ActionOptions {
         title: string;
         shortcut?: Keyboard.Shortcut;
         onAction: (toast: Toast) => void;
     }
     const Style: typeof ToastStyle_2;
     export type Style = ToastStyle_2;
     export namespace Style {
         export type Success = ToastStyle_2.Success;
         export type Failure = ToastStyle_2.Failure;
         export type Animated = ToastStyle_2.Animated;
     }
 }
 export declare interface ToastActionOptions extends Toast.ActionOptions {
 }
 export declare interface ToastOptions extends Toast.Options {
 }
 export declare const ToastStyle: typeof Toast.Style;
 declare enum ToastStyle_2 {
     Success = "SUCCESS",
     Failure = "FAILURE",
     Animated = "ANIMATED"
 }
 declare const ToggleQuickLook: FunctionComponent<ToggleQuickLookProps>;
 declare interface ToggleQuickLookProps {
     title?: string;
     icon?: Image.ImageLike;
     shortcut?: Keyboard.Shortcut;
 }
 export declare namespace Tool {
     export type Confirmation<T> = (input: T) => Promise<undefined | {
         style?: Action.Style;
         info?: {
             name: string;
             value?: string;
         }[];
         message?: string;
         image?: Image.URL | FileIcon;
     }>;
 }
 declare const Trash: FunctionComponent<TrashProps>;
 export declare function trash(path: PathLike | PathLike[]): Promise<void>;
 export declare const TrashAction: FunctionComponent<TrashProps>;
 export declare interface TrashActionProps extends Action.Trash.Props {
 }
 declare interface TrashProps {
     paths: PathLike | PathLike[];
     title?: string;
     icon?: Image.ImageLike;
     shortcut?: Keyboard.Shortcut;
     onTrash?: (paths: PathLike | PathLike[]) => void;
 }
 export declare const unstable_AI: typeof AI;
 export declare function updateCommandMetadata(metadata: {
     subtitle?: string | null;
 }): Promise<void>;
 export declare function useActionPanel(): ActionPanelState;
 export declare const useId: any;
 export declare function useNavigation(): Navigation;
 export declare const useUnstableAI: () => undefined;
 export declare namespace WindowManagement {
     export enum DesktopType {
         User = "User",
         FullScreen = "FullScreen"
     }
     export type Window = {
         id: string;
         application?: Application;
         bounds: {
             position: {
                 x: number;
                 y: number;
             };
             size: {
                 width: number;
                 height: number;
             };
         } | "fullscreen";
         desktopId: string;
         fullScreenSettable: boolean;
         resizable: boolean;
         positionable: boolean;
         active: boolean;
     };
     export type Desktop = {
         size: {
             width: number;
             height: number;
         };
         id: string;
         screenId: string;
         active: boolean;
         type: DesktopType;
     };
     export function getDesktops(): Promise<Desktop[]>;
     export function getActiveWindow(): Promise<Window>;
     export function getWindowsOnActiveDesktop(): Promise<Window[]>;
     export function setWindowBounds(options: {
         id: string;
     } & ({
         bounds: {
             position?: {
                 x?: number;
                 y?: number;
             };
             size?: {
                 width?: number;
                 height?: number;
             };
         };
         desktopId?: string;
     } | {
         bounds: "fullscreen";
     })): Promise<void>;
 }
 export { }
