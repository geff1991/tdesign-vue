import {
  computed,
  defineComponent,
  ref,
  SetupContext,
  toRefs,
  watch,
  nextTick,
  getCurrentInstance,
  onMounted,
  onUpdated,
  provide,
  reactive,
} from '@vue/composition-api';
// import SelectInput from '../select-input';
import Vue, { VNode } from 'vue';
import isFunction from 'lodash/isFunction';
import debounce from 'lodash/debounce';
import get from 'lodash/get';
import set from 'lodash/set';
import { CloseCircleFilledIcon } from 'tdesign-icons-vue';
import { useTNodeJSX } from '../hooks/tnode';
import { useConfig } from '../config-provider/useConfig';
import {
  TdSelectProps,
  SelectOption, TdOptionProps, SelectValue, SelectOptionGroup,
} from './type';
import props from './props';
import { prefix } from '../config';
import TLoading from '../loading';
import Popup from '../popup';
import CLASSNAMES from '../utils/classnames';
import TInput from '../input/index';
import Tag from '../tag/index';
import FakeArrow from '../common-components/fake-arrow';
import Option from './option';

export type OptionInstance = InstanceType<typeof Option>;

const name = `${prefix}-select`;
const listName = `${name}__list`;
// trigger元素不超过此宽度时，下拉选项的最大宽度（用户未设置overStyle width时）
// 用户设置overStyle width时，以设置的为准
const DEFAULT_MAX_OVERLAY_WIDTH = 500;
// 默认垂直滚动条宽度 .narrow-scrollbar 8px
const DEFAULT_SCROLLY_WIDTH = 8;

export default defineComponent({
  name: 'TSelect',
  model: {
    prop: 'value',
    event: 'change',
  },
  props: { ...props },
  components: {
    CloseCircleFilledIcon,
    TInput,
    TLoading,
    Tag,
    Popup,
    TOption: Option,
    FakeArrow,
  },
  // provide(): any {
  //   return {
  //     tSelect: this,
  //   };
  // },
  setup(props: TdSelectProps, context: SetupContext) {
    const instance = getCurrentInstance();
    const { t, global } = useConfig('select');
    const renderTNode = useTNodeJSX();

    // init values
    const {
      valueType,
      keys,
      disabled,
      size,
      bordered,
      popupProps,
      value,
      multiple,
      filterable,
      options,
      placeholder,
      clearable,
      showArrow,
      loading,
      creatable,
      max,
      reserveKeyword,
      empty,
      loadingText,
    } = toRefs(props);
    const test = reactive({
      test: 1,
    });
    const formDisabled = ref();
    const isHover = ref(false);
    const visible = ref(false);
    const searchInput = ref('');
    const showCreateOption = ref(false);
    const hasSlotOptions = ref(false);
    const defaultProps = ref({
      trigger: 'click',
      placement: 'bottom-left' as string,
      overlayClassName: '',
      overlayStyle: {},
    });
    const focusing = ref(false);
    const labelInValue = ref(valueType.value === 'object');
    const realValue = ref(keys.value?.value || 'value');
    const realLabel = ref(keys.value?.label || 'label');
    const realOptions = ref([] as Array<TdOptionProps>);
    const hoverIndex = ref(-1);
    const popupOpenTime = ref(250);
    const checkScroll = ref(true);
    const isInited = ref(false);

    const tDisabled = computed(() => formDisabled.value || disabled.value);
    const classes = computed(() => [
      `${name}`,
      `${prefix}-select-polyfill`, // 基于select-input改造时需要移除，polyfill代码，同时移除common中此类名
      {
        [CLASSNAMES.STATUS.disabled]: tDisabled.value,
        [CLASSNAMES.STATUS.active]: visible.value,
        [CLASSNAMES.SIZE[size.value]]: size.value,
        [`${prefix}-has-prefix`]: context.slots.prefixIcon,
        [`${prefix}-no-border`]: !bordered.value,
      },
    ]);
    const popupObject = computed(() => {
      const propsObject = popupProps.value ? { ...defaultProps.value, ...popupProps.value } : defaultProps.value;
      return propsObject;
    });
    const popClass = computed(() => `${popupObject.value.overlayClassName} ${name}__dropdown narrow-scrollbar`);
    const tipsClass = computed(() => [
      `${name}__loading-tips`,
      {
        [CLASSNAMES.SIZE[size.value]]: size.value,
      },
    ]);
    const emptyClass = computed(() => [
      `${name}__empty`,
      {
        [CLASSNAMES.SIZE[size.value]]: size.value,
      },
    ]);
    const showPlaceholder = computed(() => {
      if (
        !showFilter.value
        && ((!multiple.value && !selectedSingle.value)
          || (!multiple.value && typeof value.value === 'object' && !selectedSingle.value)
          || (multiple.value && !selectedMultiple.value.length)
          || value.value === null
          || value.value === undefined)
      ) {
        return true;
      }
      return false;
    });
    const showFilter = computed(() => {
      if (tDisabled.value) return false;
      if (!multiple.value && selectedSingle.value && canFilter.value) {
        return visible.value;
      }
      return canFilter.value;
    });
    const selectedSingle = computed(() => {
      if (!multiple.value && (typeof value.value === 'string' || typeof value.value === 'number')) {
        let target: Array<TdOptionProps> = [];
        if (realOptions.value && realOptions.value.length) {
          target = realOptions.value.filter((item) => get(item, realValue.value) === value.value);
        }
        if (target.length) {
          if (get(target[target.length - 1], realLabel.value) === '') {
            return get(target[target.length - 1], realValue.value);
          }
          return get(target[target.length - 1], realLabel.value);
        }
        return value.value.toString();
      }
      const showText = get(value.value, realLabel.value);
      // label为空时显示value值
      if (!multiple.value && typeof value.value === 'object' && showText !== undefined) {
        return showText === '' ? get(value.value, realValue.value) : showText;
      }
      return '';
    });
    const selectedMultiple = computed<TdOptionProps[]>(() => {
      if (multiple.value && Array.isArray(value.value) && value.value.length) {
        return value.value.map((item: string | number | TdOptionProps) => {
          if (typeof item === 'object') {
            return item;
          }
          const tmp = realOptions.value.filter((op) => get(op, realValue.value) === item);
          const valueLabel = {};
          set(valueLabel, realValue.value, item);
          set(valueLabel, realLabel.value, tmp.length ? get(tmp[tmp.length - 1], realLabel.value) : item);
          return tmp.length && tmp[tmp.length - 1].disabled ? { ...valueLabel, disabled: true } : valueLabel;
        });
      }
      return [];
    });
    const canFilter = computed(() => filterable.value || isFunction(props.filter));
    const isGroupOption = computed(() => {
      const firstOption = options.value?.[0];
      return !!(firstOption && 'group' in firstOption && 'children' in firstOption);
    });
    const filterPlaceholder = computed(() => {
      if (multiple.value && Array.isArray(value.value) && value.value.length) {
        return '';
      }
      if (!multiple.value && selectedSingle.value) {
        return selectedSingle.value;
      }
      return placeholder.value;
    });
    const showClose = computed(() => Boolean(
      clearable.value
          && isHover.value
          && !tDisabled.value
          && ((!multiple.value && (value.value || value.value === 0))
            || (multiple.value && Array.isArray(value.value) && value.value.length)),
    ));
    const showRightArrow = computed(() => {
      if (!showArrow.value) return false;
      return (
        !clearable.value
        || !isHover.value
        || tDisabled.value
        || (!multiple.value && !value.value && value.value !== 0)
        || (multiple.value && (!Array.isArray(value.value) || (Array.isArray(value.value) && !value.value.length)))
      );
    });
    const showLoading = computed(() => loading.value && !tDisabled.value);
    const filterOptions = computed(() => {
      // filter优先级 filter方法>仅filterable
      if (isFunction(props.filter)) {
        return realOptions.value.filter((option) => props.filter(searchInput.value, option));
      }
      if (filterable.value) {
        // 仅有filterable属性时，默认不区分大小写过滤label
        return realOptions.value.filter(
          (option) => option[realLabel.value].toString().toLowerCase().indexOf(searchInput.value.toString().toLowerCase()) !== -1,
        );
      }
      return [];
    });
    const displayOptions = computed(() => {
      // 展示优先级，用户远程搜索传入>组件通过filter过滤>getOptions后的完整数据
      if (isFunction(props.onSearch) || context.listeners.search) {
        return realOptions.value;
      }
      if (canFilter.value && !creatable.value) {
        if (searchInput.value === '') {
          return realOptions.value;
        }
        return filterOptions.value;
      }
      return realOptions.value;
    });
    provide('tSelect', this);
    const displayOptionsMap = computed(() => {
      const map = new Map();
      displayOptions.value.forEach((item) => {
        map.set(item, true);
      });
      return map;
    });
    const hoverOptions = computed(() => {
      if (!showCreateOption.value) {
        if (isFunction(props.filter) || filterable.value) {
          return filterOptions.value;
        }
        return realOptions.value;
      }
      const willCreateOption = [{ value: searchInput.value, label: searchInput.value }] as Array<TdOptionProps>;
      if (isFunction(props.filter) || filterable.value) {
        return willCreateOption.concat(filterOptions.value);
      }
      return willCreateOption.concat(realOptions.value);
    });

    const doFocus = () => {
      const input = context.refs.input as HTMLElement;
      input?.focus();
      focusing.value = true;
    };
    watch(showFilter, (val) => {
      if (val && selectedSingle.value) {
        nextTick(() => {
          doFocus();
        });
      }
    });
    const debounceOnRemote = debounce((this: any) => {
      instance.emit('search', searchInput.value, context);
      // emitEvent<Parameters<TdSelectProps['onSearch']>>(this, 'search', searchInput.value);
    }, 300);
    watch(searchInput, (val) => {
      if (!val && !visible.value) return;
      if (isFunction(props.onSearch) || context.listeners.search) {
        debounceOnRemote();
      }
      if (canFilter.value && val && creatable.value) {
        const tmp = realOptions.value.filter((item) => get(item, realLabel.value).toString() === val);
        showCreateOption.value = !tmp.length;
      } else {
        showCreateOption.value = false;
      }
    });
    const getRealOptions = (options: SelectOption[]): Array<TdOptionProps> => {
      let result = [];
      if (isGroupOption.value) {
        let arr: TdOptionProps[] = [];
        options.forEach((item) => {
          if ('children' in item) {
            arr = arr.concat(item.children);
          }
        });
        result = arr;
      } else {
        result = [...options];
      }
      // support ['A', 'B', 'C'] this type of options
      return result.map((item) => {
        if (typeof item !== 'object') return { label: item, value: item };
        return item;
      });
    };
    watch(
      options,
      (val) => {
        if (Array.isArray(val)) {
          realOptions.value = getRealOptions(val);
        } else {
          console.error('TDesign Select: options must be an array.');
        }
      },
      {
        immediate: true,
      },
    );
    const initHoverindex = () => {
      const ableOptionIndex = Object.keys(hoverOptions.value).filter((i) => !hoverOptions.value[i].disabled);
      const ableIndex = ableOptionIndex.length ? ableOptionIndex[0] : '0';
      if (!multiple.value && (typeof value.value === 'string' || typeof value.value === 'number')) {
        const targetIndex = Object.keys(hoverOptions.value).filter(
          (i) => get(hoverOptions.value[i], realValue.value) === value.value,
        );
        hoverIndex.value = targetIndex.length
          ? parseInt(targetIndex[targetIndex.length - 1], 10)
          : parseInt(ableIndex, 10);
      } else if (multiple.value) {
        hoverIndex.value = parseInt(ableIndex, 10);
        Array.isArray(value.value)
          && value.value.some((item: string | number | TdOptionProps) => {
            const targetIndex = Object.keys(hoverOptions.value).filter(
              (i) => (typeof item === 'object'
                  && get(hoverOptions.value[i], realValue.value) === get(item, realValue.value))
                || get(hoverOptions.value[i], realValue.value) === item,
            );
            hoverIndex.value = targetIndex.length
              ? parseInt(targetIndex[targetIndex.length - 1], 10)
              : parseInt(ableIndex, 10);
            return hoverIndex.value !== -1;
          });
      }
    };
    const arrowDownOption = () => {
      let count = 0;
      while (hoverIndex.value < hoverOptions.value.length) {
        if (!hoverOptions.value[hoverIndex.value] || !hoverOptions.value[hoverIndex.value].disabled) {
          break;
        }
        if (hoverIndex.value === hoverOptions.value.length - 1) {
          hoverIndex.value = 0;
        } else {
          hoverIndex.value += 1;
        }
        count += 1;
        if (count >= hoverOptions.value.length) break;
      }
    };
    const arrowUpOption = () => {
      let count = 0;
      while (hoverIndex.value > -1) {
        if (!hoverOptions.value[hoverIndex.value] || !hoverOptions.value[hoverIndex.value].disabled) {
          break;
        }
        if (hoverIndex.value === 0) {
          hoverIndex.value = hoverOptions.value.length - 1;
        } else {
          hoverIndex.value -= 1;
        }
        count += 1;
        if (count >= hoverOptions.value.length) break;
      }
    };
    const keydownEvent = (e: KeyboardEvent) => {
      if (!hoverOptions.value.length) return;
      const preventKeys = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'];
      if (preventKeys.includes(e.code)) {
        e.preventDefault();
      }
      switch (e.code) {
        case 'ArrowDown':
          if (hoverIndex.value === -1) {
            initHoverindex();
            return;
          }
          if (hoverIndex.value < hoverOptions.value.length - 1) {
            hoverIndex.value += 1;
            arrowDownOption();
          } else {
            hoverIndex.value = 0;
            arrowDownOption();
          }
          break;
        case 'ArrowUp':
          if (hoverIndex.value === -1) {
            initHoverindex();
            return;
          }
          if (hoverIndex.value > 0) {
            hoverIndex.value -= 1;
            arrowUpOption();
          } else {
            hoverIndex.value = hoverOptions.value.length - 1;
            arrowUpOption();
          }
          break;
        case 'Enter':
          if (hoverIndex.value === -1) return;
          if (showCreateOption.value && hoverIndex.value === 0) {
            createOption(searchInput.value);
          }
          hoverOptions.value[hoverIndex.value]
            && onOptionClick(hoverOptions.value[hoverIndex.value][realValue.value], e);
          break;
        case 'Escape':
        case 'Tab':
          visible.value = false;
          instance.emit('visible-change', false, context);
          // emitEvent<Parameters<TdSelectProps['onVisibleChange']>>(this, 'visible-change', false);
          searchInput.value = '';
          if (focusing.value) {
            blur(searchInput.value, { e });
          }
          break;
      }
    };
    watch(visible, (val) => {
      val && document.addEventListener('keydown', keydownEvent);
      !val && document.removeEventListener('keydown', keydownEvent);
      !val && (showCreateOption.value = false);
    });

    const multiLimitDisabled = (v: string | number) => {
      if (multiple.value && max.value) {
        if (Array.isArray(value.value) && value.value.indexOf(v) === -1 && max.value <= value.value.length) {
          return true;
        }
      }
      return false;
    };
    const visibleChange = (val: boolean) => {
      // emitEvent<Parameters<TdSelectProps['onVisibleChange']>>(this, 'visible-change', val);
      instance.emit('visible-change', val, context);
      visible.value = val;
      if (!val) {
        searchInput.value = '';
      }
      val && monitorWidth();
      val && canFilter.value && doFocus();
    };
    const onOptionClick = (v: string | number, e: MouseEvent | KeyboardEvent) => {
      if (value.value !== v) {
        if (multiple.value) {
          const tempValue = Array.isArray(value.value) ? [].concat(value.value) : [];
          if (labelInValue.value) {
            const index = tempValue.map((item) => get(item, realValue.value)).indexOf(v);
            if (index > -1) {
              removeTag(index, { e });
            } else {
              tempValue.push(realOptions.value.filter((item) => get(item, realValue.value) === v)[0]);
              emitChange(tempValue);
            }
          } else {
            const index = tempValue.indexOf(v);
            if (index > -1) {
              removeTag(index, { e });
            } else {
              tempValue.push(v);
              emitChange(tempValue);
            }
          }
        } else {
          emitChange(v);
        }
      }
      if (!multiple.value) {
        searchInput.value = '';
        hideMenu();
      } else {
        if (!reserveKeyword.value) {
          searchInput.value = '';
        }
        canFilter.value && doFocus();
      }
    };
    const removeTag = (index: number, context?: { e?: MouseEvent | KeyboardEvent }) => {
      const { e } = context || {};
      e?.stopPropagation();
      if (tDisabled.value) {
        return;
      }
      const val = value.value[index];
      const removeOption = realOptions.value.filter((item) => get(item, realValue.value) === val);
      const tempValue = Array.isArray(value.value) ? [].concat(value.value) : [];
      tempValue.splice(index, 1);
      emitChange(tempValue);
      // emitEvent<Parameters<TdSelectProps['onRemove']>>(this, 'remove', { value: val, data: removeOption[0], e });
      instance.emit('remove', { value: val, data: removeOption[0], e }, context);
    };
    const hideMenu = () => {
      visible.value = false;
      // emitEvent<Parameters<TdSelectProps['onVisibleChange']>>(this, 'visible-change', false);
      instance.emit('visible-change', false, context);
    };
    const clearSelect = (e: MouseEvent) => {
      e?.stopPropagation();
      if (multiple.value) {
        emitChange([]);
      } else {
        emitChange('');
      }
      focusing.value = false;
      searchInput.value = '';
      visible.value = false;
      // emitEvent<Parameters<TdSelectProps['onClear']>>(this, 'clear', { e });
      instance.emit('clear', { e }, context);
    };
    const getOptions = (option: OptionInstance) => {
      // create option值不push到options里
      if (option.$el && option.$el.className && option.$el.className.indexOf(`${name}__create-option--special`) !== -1) return;
      const tmp = realOptions.value.filter(
        (item) => get(item, realValue.value) === option.value && get(item, realLabel.value) === option.label,
      );
      if (!tmp.length) {
        hasSlotOptions.value = true;
        const valueLabel = {};
        set(valueLabel, realValue.value, option.value);
        set(valueLabel, realLabel.value, option.label);
        const valueLabelAble = option.disabled ? { ...valueLabel, disabled: true } : valueLabel;
        realOptions.value.push(valueLabelAble);
      }
    };
    const destroyOptions = (option: OptionInstance) => {
      realOptions.value.forEach((item, index) => {
        if (item[realValue.value] === option.value && item[realLabel.value] === option.label) {
          realOptions.value.splice(index, 1);
        }
      });
    };
    const emitChange = (val: SelectValue | Array<SelectValue>) => {
      let value: SelectValue | Array<SelectValue> | Array<TdOptionProps> | TdOptionProps;
      if (labelInValue.value) {
        if (Array.isArray(val)) {
          if (!val.length) {
            value = [];
          } else {
            value = val;
          }
        } else {
          const target = realOptions.value.filter((item) => get(item, realValue.value) === val);
          value = target.length ? target[0] : '';
        }
      } else {
        value = val;
      }
      // emitEvent<Parameters<TdSelectProps['onChange']>>(this, 'change', value);
      instance.emit('change', value, context);
    };
    const createOption = (value: string) => {
      // emitEvent<Parameters<TdSelectProps['onCreate']>>(this, 'create', value);
      instance.emit('create', value, context);
    };
    const focus = (value: string, context: { e: FocusEvent }) => {
      focusing.value = true;
      // emitEvent<Parameters<TdSelectProps['onFocus']>>(this, 'focus', { value: value, e: context?.e });
      instance.emit('focus', { value, e: context?.e }, context);
    };
    const blur = (value: string, context: { e: FocusEvent | KeyboardEvent }) => {
      focusing.value = false;
      // emitEvent<Parameters<TdSelectProps['onBlur']>>(this, 'blur', { value: value, e: context?.e });
      instance.emit('blur', { value, e: context?.e }, context);
    };
    const enter = (value: string, context: { e: KeyboardEvent }) => {
      // emitEvent<Parameters<TdSelectProps['onEnter']>>(this, 'enter', {
      //   inputValue: searchInput,
      //   value: value,
      //   e: context?.e,
      // });
      instance.emit('enter', { value, e: context?.e, inputValue: searchInput.value }, context);
    };
    const hoverEvent = (v: boolean) => {
      isHover.value = v;
    };
    const getOverlayElm = (): HTMLElement => {
      let r;
      try {
        r = (context.refs.popup as any).$refs.overlay || (context.refs.popup as any).$refs.component.$refs.overlay;
      } catch (e) {
        console.warn('TDesign Warn:', e);
      }
      return r;
    };
    // 打开浮层时，监听trigger元素和浮层宽度，取max
    const monitorWidth = () => {
      nextTick(() => {
        let styles = (popupProps.value && popupProps.value.overlayStyle) || {};
        if (popupProps.value && isFunction(popupProps.value.overlayStyle)) {
          styles = popupProps.value.overlayStyle(context.refs.select as HTMLElement, context.refs.content as HTMLElement)
            || {};
        }
        if (typeof styles === 'object' && !styles.width) {
          const elWidth = (context.refs.select as HTMLElement).getBoundingClientRect().width;
          const popupWidth = getOverlayElm().getBoundingClientRect().width;
          const width = elWidth > DEFAULT_MAX_OVERLAY_WIDTH
            ? elWidth
            : Math.min(DEFAULT_MAX_OVERLAY_WIDTH, Math.max(elWidth, popupWidth));
          Vue.set(defaultProps.value, 'overlayStyle', { width: `${Math.ceil(width)}px` });
          // issues-549 弹出层出现滚动条时，需要加上滚动条宽度，否则会挤压宽度，导致出现省略号
          if (checkScroll.value) {
            const timer = setTimeout(() => {
              const { scrollHeight, clientHeight } = getOverlayElm();
              if (scrollHeight > clientHeight) {
                Vue.set(defaultProps.value, 'overlayStyle', { width: `${Math.ceil(width) + DEFAULT_SCROLLY_WIDTH}px` });
              }
              checkScroll.value = false;
              clearTimeout(timer);
            }, popupOpenTime.value);
          }
        }
      });
    };
    const getEmpty = () => {
      const useLocale = !empty.value && !context.slots.empty;
      return useLocale ? t(global.value.empty) : renderTNode('empty');
    };
    const getLoadingText = () => {
      const useLocale = !loadingText && !context.slots.loadingText;
      return useLocale ? t(global.value.loadingText) : renderTNode('loadingText');
    };
    const getPlaceholderText = () => placeholder.value || t(global.value.placeholder);
    const getCloseIcon = () => {
      // TODO 基于select-input改造时需要移除，polyfill代码，同时移除common中此类名
      const closeIconClass = [`${name}__right-icon`, `${name}__right-icon-clear`, `${name}__right-icon-polyfill`];
      if (isFunction(global.value.clearIcon)) {
        return <span class={closeIconClass} onClick={clearSelect}></span>;
      }
      return <CloseCircleFilledIcon class={closeIconClass} size={size.value} nativeOnClick={clearSelect} />;
    };
    const renderGroupOptions = (options: SelectOptionGroup[]) => (
        <ul class={listName}>
          {options.map((groupList: SelectOptionGroup) => {
            const children = groupList.children.filter((item) => displayOptionsMap.value.get(item));
            return (
              <t-option-group v-show={children.length} label={groupList.group} divider={groupList.divider}>
                {renderOptions(children)}
              </t-option-group>
            );
          })}
        </ul>
    );
    // options 直传时
    const renderOptions = (options: SelectOption[]) => (
        <ul class={listName}>
          {options.map((item: TdOptionProps, index: number) => (
            <t-option
              value={get(item, realValue.value)}
              label={get(item, realLabel.value)}
              content={item.content}
              disabled={item.disabled || multiLimitDisabled(get(item, realValue.value))}
              key={index}
            ></t-option>
          ))}
        </ul>
    );
    // 两类：普通选择器和分组选择器
    const renderDataWithOptions = () => isGroupOption.value
      ? renderGroupOptions(options.value as SelectOptionGroup[])
      : renderOptions(displayOptions.value);
    const renderContent = () => {
      const children = renderTNode('default');
      const emptySlot = getEmpty();
      const loadingTextSlot = getLoadingText();
      return (
        <div slot="content" class={`${name}__dropdown-inner`}>
          {renderTNode('panelTopContent')}
          <ul v-show={showCreateOption.value} class={[`${name}__create-option`, listName]}>
            <t-option value={searchInput.value} label={searchInput.value} class={`${name}__create-option--special`} />
          </ul>
          {loading && <div class={tipsClass.value}>{loadingTextSlot}</div>}
          {!loading.value && !displayOptions.value.length && !showCreateOption.value && (
            <div class={emptyClass.value}>{emptySlot}</div>
          )}
          {!hasSlotOptions.value && displayOptions.value.length && !loading.value ? (
            renderDataWithOptions()
          ) : (
            <ul v-show={!loading.value && displayOptions.value.length} class={[`${prefix}-select__groups`, listName]}>
              {children}
            </ul>
          )}
          {renderTNode('panelBottomContent')}
        </div>
      );
    };
    /**
     * Parse options from slots before popup, execute only once
     */
    const initOptions = () => {
      if (realOptions.value.length || isInited.value) return;

      const children = renderTNode('default');
      if (children) {
        realOptions.value = parseOptions(children);
        isInited.value = true;
        hasSlotOptions.value = true;
      }

      function parseOptions(vnodes: VNode[]): TdOptionProps[] {
        if (!vnodes) return [];
        return vnodes.reduce((options, vnode) => {
          const { componentOptions } = vnode;
          if (componentOptions?.tag === 't-option') {
            const propsData = componentOptions.propsData as any;
            return options.concat({
              label: propsData.label,
              value: propsData.value,
              disabled: propsData.disabled,
              content: componentOptions.children ? () => componentOptions.children : propsData.content,
              default: propsData.default,
            });
          }
          if (componentOptions?.tag === 't-option-group') {
            return options.concat(parseOptions(componentOptions.children));
          }
          return options;
        }, []);
      }
    };

    onMounted(() => {
      initOptions();
    });
    onUpdated(() => {
      initOptions();
    });

    return {
      getPlaceholderText,
      visibleChange,
      hoverEvent,
      removeTag,
      realLabel,
      selectedMultiple,
      popupObject,
    };
  },

  render(h): VNode {
    const {
      classes,
      popupObject,
      tDisabled,
      popClass,
      size,
      showPlaceholder,
      selectedMultiple,
      multiple,
      showFilter,
      selectedSingle,
      filterPlaceholder,
      realLabel,
      visible,
      minCollapsedNum,
      collapsedItems,
      searchInput,
      showRightArrow,
      showLoading,
      showClose,
    } = this;
    const renderTNode = useTNodeJSX();
    const prefixIconSlot = renderTNode('prefixIcon');
    const placeholderText = this.getPlaceholderText;
    return (
      <div ref="select" class={`${name}__wrap`}>
        <Popup
          ref="popup"
          visible={visible}
          class={`${name}__popup-reference`}
          disabled={tDisabled}
          on={{ 'visible-change': this.visibleChange }}
          expandAnimation={true}
          {...{ props: { ...popupObject, overlayClassName: popClass } }}
        >
          <div class={classes}>
            {prefixIconSlot && <span class={`${name}__left-icon`}>{prefixIconSlot[0]}</span>}
            {showPlaceholder && <span class={`${name}__placeholder`}> {placeholderText}</span>}
            {this.valueDisplay || this.$scopedSlots.valueDisplay
              ? renderTNode('valueDisplay', {
                params: { value: selectedMultiple, onClose: (index: number) => this.removeTag(index) },
              })
              : selectedMultiple.map((item: TdOptionProps, index: number) => (
                  <tag
                    v-show={minCollapsedNum <= 0 || index < minCollapsedNum}
                    key={index}
                    size={size}
                    closable={!item.disabled && !tDisabled}
                    disabled={tDisabled}
                    style="max-width: 100%;"
                    maxWidth="100%"
                    onClose={this.removeTag.bind(null, index)}
                  >
                    {get(item, realLabel)}
                  </tag>
              ))}
            {collapsedItems || this.$scopedSlots.collapsedItems ? (
              renderTNode('collapsedItems', {
                params: {
                  value: selectedMultiple,
                  collapsedSelectedItems: selectedMultiple.slice(minCollapsedNum),
                  count: selectedMultiple.length - minCollapsedNum,
                },
              })
            ) : (
              <tag v-show={minCollapsedNum > 0 && selectedMultiple.length > minCollapsedNum} size={size}>
                {`+${selectedMultiple.length - minCollapsedNum}`}
              </tag>
            )}
            {!multiple && !showPlaceholder && !showFilter && <span class={`${name}__single`}>{selectedSingle}</span>}
            {showFilter && (
              <t-input
                ref="input"
                v-model={searchInput}
                size={size}
                placeholder={filterPlaceholder}
                disabled={tDisabled}
                class={`${name}__input`}
                readonly={!visible || !showFilter}
                onFocus={this.focus}
                onBlur={this.blur}
                onEnter={this.enter}
              />
            )}
            {showRightArrow && !showLoading && (
              // TODO 基于select-input改造时需要移除，polyfill代码，同时移除common中此类名
              <fake-arrow
                overlayClassName={`${name}__right-icon ${name}__right-icon-polyfill`}
                isActive={visible && !tDisabled}
              />
            )}
            {showClose && !showLoading && this.getCloseIcon}
            {/* TODO 基于select-input改造时需要移除，polyfill代码，同时移除common中此类名 */}
            {showLoading && (
              <t-loading class={`${name}__right-icon ${name}__active-icon ${name}__right-icon-polyfill`} size="small" />
            )}
          </div>
          {this.renderContent}
        </Popup>
      </div>
    );
  },
});
