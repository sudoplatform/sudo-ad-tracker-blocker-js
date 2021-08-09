import * as Entitlements from './entitlements'

it('should expose atbUserEntitled entitlement name', () => {
  expect(Entitlements.userEntitled).toEqual('sudoplatform.atb.atbUserEntitled')
})
