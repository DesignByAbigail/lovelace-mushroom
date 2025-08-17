import { UnsubscribeFunc } from "home-assistant-js-websocket";
import {
  css,
  CSSResultGroup,
  html,
  LitElement,
  nothing,
  PropertyValues,
  TemplateResult,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import hash from "object-hash/dist/object_hash";
import {
  actionHandler,
  ActionHandlerEvent,
  computeRTL,
  handleAction,
  hasAction,
  HomeAssistant,
  RenderTemplateResult,
  subscribeRenderTemplate,
} from "../../../ha";
import "../../../shared/state-info";
import "../../../shared/state-item";
import { computeAppearance } from "../../../utils/appearance";
import { CacheManager } from "../../../utils/cache-manager";
import { computeRgbColor } from "../../../utils/colors";
import { getWeatherSvgIcon } from "../../../utils/icons/weather-icon";
import {
  computeChipComponentName,
  computeChipEditorComponentName,
} from "../../../utils/lovelace/chip/chip-element";
import {
  LovelaceChip,
  AdvancedChipConfig,
} from "../../../utils/lovelace/chip/types";
import { LovelaceChipEditor } from "../../../utils/lovelace/types";
import { weatherSVGStyles } from "../../../utils/weather";

const templateCache = new CacheManager<TemplateResults>(1000);

type TemplateResults = Partial<
  Record<TemplateKey, RenderTemplateResult | undefined>
>;

const TEMPLATE_KEYS = ["primary", "secondary", "max_width", "icon", "icon_color", "icon_background", "badge_icon", "badge_color", "picture"] as const;
type TemplateKey = (typeof TEMPLATE_KEYS)[number];

@customElement(computeChipComponentName("advanced"))
export class AdvancedChip extends LitElement implements LovelaceChip {
  public static async getConfigElement(): Promise<LovelaceChipEditor> {
    await import("./advanced-chip-editor");
    return document.createElement(
      computeChipEditorComponentName("advanced")
    ) as LovelaceChipEditor;
  }

  public static async getStubConfig(
    _hass: HomeAssistant
  ): Promise<AdvancedChipConfig> {
    return {
      type: `advanced`,
    };
  }

  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: AdvancedChipConfig;

  @state() private _templateResults?: TemplateResults;

  @state() private _unsubRenderTemplates: Map<
    TemplateKey,
    Promise<UnsubscribeFunc>
  > = new Map();

  public setConfig(config: AdvancedChipConfig): void {
    TEMPLATE_KEYS.forEach((key) => {
      if (
        this._config?.[key] !== config[key] ||
        this._config?.entity != config.entity
      ) {
        this._tryDisconnectKey(key);
      }
    });
    this._config = {
      tap_action: {
        action: "toggle",
      },
      hold_action: {
        action: "more-info",
      },
      ...config,
    };
  }

  public connectedCallback() {
    super.connectedCallback();
    this._tryConnect();
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._tryDisconnect();

    if (this._config && this._templateResults) {
      const key = this._computeCacheKey();
      templateCache.set(key, this._templateResults);
    }
  }

  private _computeCacheKey() {
    return hash(this._config);
  }

  protected willUpdate(_changedProperties: PropertyValues): void {
    super.willUpdate(_changedProperties);
    if (!this._config) {
      return;
    }

    if (!this._templateResults) {
      const key = this._computeCacheKey();
      if (templateCache.has(key)) {
        this._templateResults = templateCache.get(key)!;
      } else {
        this._templateResults = {};
      }
    }
  }

  private _handleAction(ev: ActionHandlerEvent) {
    handleAction(this, this.hass!, this._config!, ev.detail.action!);
  }

  public isTemplate(key: TemplateKey) {
    const value = this._config?.[key];
    return value?.includes("{");
  }

  private getValue(key: TemplateKey) {
    return this.isTemplate(key)
      ? this._templateResults?.[key]?.result?.toString()
      : this._config?.[key];
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    const icon = this.getValue("icon");
    const iconColor = this.getValue("icon_color");
    const iconBackground = this.getValue("icon_background");
    const badgeIcon = this.getValue("badge_icon");
    const badgeColor = this.getValue("badge_color");
    const primary = this.getValue("primary");
    const secondary = this.getValue("secondary");
    const maxWidth = this.getValue("max_width");
    const picture = this.getValue("picture");

    const rtl = computeRTL(this.hass);
    const weatherSvg = getWeatherSvgIcon(icon);

    const appearance = computeAppearance({
      fill_container: false,
      layout: "horizontal",
      icon_type: Boolean(picture)
        ? "entity-picture"
        : Boolean(icon)
          ? "icon"
          : "none",
      primary_info: Boolean(primary) ? "name" : "none",
      secondary_info: Boolean(secondary) ? "state" : "none",
    });
    
    const stateItemStyle = {};
    stateItemStyle["padding"] = `0px var(--chip-avatar-padding)`;

    return html`
      <mushroom-chip
        ?rtl=${rtl}
        @action=${this._handleAction}
        .actionHandler=${actionHandler({
          hasHold: hasAction(this._config.hold_action),
          hasDoubleClick: hasAction(this._config.double_tap_action),
        })}
        class="advanced"
      >
        <mushroom-state-item
          ?rtl=${rtl}
          .appearance=${appearance}
          style=${styleMap(stateItemStyle)}
        >
          ${picture
            ? this.renderPicture(picture)
            : weatherSvg
              ? html`<div slot="icon">${weatherSvg}</div>`
              : icon
                ? this.renderIcon(icon, iconColor, iconBackground)
                : nothing}
          ${(icon || picture) && badgeIcon
            ? this.renderBadgeIcon(badgeIcon, badgeColor)
            : undefined}
          <mushroom-state-info
            slot="info"
            .primary=${primary
              ? this.renderSubContent(primary)
              : nothing}
            .secondary=${secondary
              ? this.renderSubContent(secondary)
              : nothing}
            style="max-width: ${maxWidth}"
            class="advanced"
          ></mushroom-state-info>
        </mushroom-state-item>
      </mushroom-chip>
    `;
  }

  renderPicture(picture: string): TemplateResult {
    return html`
      <mushroom-shape-avatar
        slot="icon"
        class="avatar"
        .picture_url=${(this.hass as any).hassUrl(picture)}
      ></mushroom-shape-avatar>
    `;
  }

  renderIcon(icon: string, iconColor?: string, iconBackground?: string) {
    const iconStyle = {};
    if (iconColor) {
      const iconRgbColor = computeRgbColor(iconColor);
      iconStyle["--icon-color"] = `rgb(${iconRgbColor})`;
      if (iconBackground) {
        iconStyle["--shape-color"] = `rgba(${iconRgbColor}, ${iconBackground})`;
      } else {
        iconStyle["--shape-color"] = `rgba(${iconRgbColor}, 0.05)`;
      }
    } else {
      if (iconBackground) {
        iconStyle["--shape-color"] = `rgba(var(--rgb-primary-text-color), ${iconBackground})`;
      } else {
        iconStyle["--shape-color"] = `rgba(var(--rgb-primary-text-color), 0.05)`;
      }
    }
    return html`
      <mushroom-shape-icon
        style=${styleMap(iconStyle)}
        slot="icon"
      >
        <ha-state-icon
          .hass=${this.hass}
          .icon=${icon}
        ></ha-state-icon
      ></mushroom-shape-icon>
    `;
  }

  renderBadgeIcon(badge: string, badgeColor?: string) {
    const badgeStyle = {};
    if (badgeColor) {
      const iconRgbColor = computeRgbColor(badgeColor);
      badgeStyle["--main-color"] = `rgba(${iconRgbColor})`;
    }
    return html`
      <mushroom-badge-icon
        slot="badge"
        .icon=${badge}
        style=${styleMap(badgeStyle)}
      ></mushroom-badge-icon>
    `;
  }

  protected renderInlineIcon(icon: string, iconColor?: string): TemplateResult {
    const iconStyle = {};
    iconStyle["--mdc-icon-size"] = `var(--mush-chip-icon-size, 1em)`;
    if (iconColor) {
      const iconRgbColor = computeRgbColor(iconColor);
      iconStyle["--icon-primary-color"] = `rgb(${iconRgbColor})`;
    }
    return html`
      <ha-state-icon
        .hass=${this.hass}
        .icon=${icon}
        style=${styleMap(iconStyle)}
      ></ha-state-icon>
    `;
  }
  
  protected renderContent(primary?: string, secondary?: string, maxWidth?: string): TemplateResult {
    const textStyle = {};
    if (maxWidth) {
      textStyle["max-width"] = `${maxWidth}`;
    }
    return html`
      <div class="container">
        <span
          class="primary"
          style=${styleMap(textStyle)}>
          ${this.renderSubContent(primary ?? "")}
        </span>
        ${secondary
          ? html`
            <span
              class="secondary"
              style=${styleMap(textStyle)}>
              ${this.renderSubContent(secondary)}
            </span>
          `
          : nothing}
      </div>
    `;
  }

  protected renderSubContent(content: string): TemplateResult {
    var render = html``;
    var index = 0;
    var startIndex = 0;
    var prefixIndex = 0;
    var colorIndex = 0;
    var endIndex = 0;
    
    do {
      startIndex = content.indexOf("[", index);
      prefixIndex = content.indexOf(":", startIndex);
      colorIndex = content.indexOf(" color:", prefixIndex);
      endIndex = content.indexOf("]", prefixIndex);
      
      if (
        (startIndex != -1) &&
        (prefixIndex == startIndex + 4) &&
        (endIndex > prefixIndex)
      ) {
        render = html`${render}${content.substring(index, startIndex)}`;
        if ((prefixIndex < colorIndex) && (colorIndex < endIndex)) {
          render = html`${render}${this.renderInlineIcon(content.substring(startIndex+1, colorIndex), content.substring(colorIndex+7, endIndex))}`;
        } else {
          render = html`${render}${this.renderInlineIcon(content.substring(startIndex+1, endIndex), undefined)}`;
        }
        index = endIndex + 1;
      } else if (startIndex != -1) {
        render = html`${render}${content.substring(index, startIndex+1)}`;
        index = startIndex + 1;
      } else {
        render = html`${render}${content.substring(index)}`;
      }
    } while (startIndex != -1);
    return render;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    if (!this._config || !this.hass) {
      return;
    }

    this._tryConnect();
  }

  private async _tryConnect(): Promise<void> {
    TEMPLATE_KEYS.forEach((key) => {
      this._tryConnectKey(key);
    });
  }

  private async _tryConnectKey(key: TemplateKey): Promise<void> {
    if (
      this._unsubRenderTemplates.get(key) !== undefined ||
      !this.hass ||
      !this._config ||
      !this.isTemplate(key)
    ) {
      return;
    }

    try {
      const sub = subscribeRenderTemplate(
        this.hass.connection,
        (result) => {
          this._templateResults = {
            ...this._templateResults,
            [key]: result,
          };
        },
        {
          template: this._config[key] ?? "",
          entity_ids: this._config.entity_id,
          variables: {
            config: this._config,
            user: this.hass.user!.name,
            entity: this._config.entity,
          },
          strict: true,
        }
      );
      this._unsubRenderTemplates.set(key, sub);
      await sub;
    } catch (_err) {
      const result = {
        result: this._config[key] ?? "",
        listeners: {
          all: false,
          domains: [],
          entities: [],
          time: false,
        },
      };
      this._templateResults = {
        ...this._templateResults,
        [key]: result,
      };
      this._unsubRenderTemplates.delete(key);
    }
  }
  private async _tryDisconnect(): Promise<void> {
    TEMPLATE_KEYS.forEach((key) => {
      this._tryDisconnectKey(key);
    });
  }

  private async _tryDisconnectKey(key: TemplateKey): Promise<void> {
    const unsubRenderTemplate = this._unsubRenderTemplates.get(key);
    if (!unsubRenderTemplate) {
      return;
    }

    try {
      const unsub = await unsubRenderTemplate;
      unsub();
      this._unsubRenderTemplates.delete(key);
    } catch (err: any) {
      if (err.code === "not_found" || err.code === "template_error") {
        // If we get here, the connection was probably already closed. Ignore.
      } else {
        throw err;
      }
    }
  }

  static get styles(): CSSResultGroup {
    return css`
      mushroom-chip.advanced {
        cursor: pointer;
        --avatar-size: calc(
          var(--chip-height) - 2 * var(--chip-avatar-padding)
        );
        --icon-size: var(--avatar-size);
        --card-primary-font-weight: var(--chip-font-weight);
        --card-secondary-font-weight: var(--chip-font-weight);
        --card-primary-font-size: var(--chip-font-size);
        --card-secondary-font-size: var(--chip-font-size);
        --card-primary-color: var(--primary-text-color);
        --card-secondary-color: var(--secondary-text-color);
        --card-primary-line-height: 1;
        --card-secondary-line-height: 1;
        --chip-padding: 0px;
        --spacing: 0px;
        --gap: var(--chip-avatar-padding);
      }
      ha-state-icon {
        --mdc-icon-size: var(--chip-icon-size);
        font-size: var(--chip-height);
        padding: var(--mush-chip-padding, 0 0.25em);
      }
      ${weatherSVGStyles}
      mushroom-shape-avatar {
        
      }
      mushroom-state-info.advanced {
        margin: var(--mush-chip-padding, 0 calc(0.25em - var(--chip-avatar-padding)));
      }
      .advanced ha-card .content {
        min-width: var(--chip-height);
      }
    `;
  }
}
