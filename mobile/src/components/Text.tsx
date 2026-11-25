// Text and TextInput that always render in Figtree, in the app's text colour unless a
// style says otherwise. The weight in the style picks the matching Figtree file, because
// Android does not synthesise weights for custom fonts.
import React from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';
import { colors, familyFor } from '../lib/theme';

type RNTextProps = React.ComponentProps<typeof RNText>;
type RNTextInputProps = React.ComponentProps<typeof RNTextInput>;

function withFamily(style: TextProps['style']) {
  const flat = (StyleSheet.flatten(style) || {}) as { fontWeight?: string | number; fontFamily?: string };
  const { fontWeight, ...rest } = flat;
  return [{ color: colors.text }, rest, { fontFamily: flat.fontFamily || familyFor(fontWeight) }];
}

export function Text(props: RNTextProps) {
  return <RNText {...props} style={withFamily(props.style)} />;
}

export function TextInput(props: RNTextInputProps) {
  return <RNTextInput {...props} style={withFamily(props.style) as TextInputProps['style']} />;
}
